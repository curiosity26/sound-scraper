//! Now-playing markers for a recording (design doc "Auto-tag and split from
//! now-playing info"): while recording, the OS's now-playing service says
//! when each song starts; on Stop one song becomes the file's tags and
//! several become a draft in the track editor, split, named and tagged.
//!
//! Song changes arrive in wall-clock time, so the recorder keeps a
//! [`Timeline`] (when each stretch of audio reached the file) to convert
//! them to positions in the file, and a [`SilenceMap`] of the quiet runs it
//! wrote, to snap each change to the real gap between songs.

use std::{
    sync::{Arc, Mutex},
    thread::JoinHandle,
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};
use sound_scraper_capture::CaptureSource;
use sound_scraper_nowplaying::{
    NowPlayingBackend, Target, Track, Watcher,
    watcher::{TrackChange, WatchEvent},
};

use crate::{
    edit::edits::{self, EditList, Region, Splice, TrackTags},
    tags::{self, CoverEdit, TagEdit, TagVersion},
};

pub type NowPlayingFactory = Box<dyn Fn() -> Box<dyn NowPlayingBackend> + Send>;

/// A song seen while recording.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Marker {
    /// Where the song starts in the finished file.
    pub at_ms: f64,
    /// The song's title (becomes the track name).
    pub title: String,
    pub tags: TrackTags,
    /// Joined mid-song, or cut short (skipped or stopped) well before its
    /// end.
    pub partial: bool,
    /// Looks like an ad (Spotify free).
    pub ad: bool,
    /// No silence was found near the change; the cut sits at the estimate.
    pub unsnapped: bool,
}

/// The markers file in a recording's draft folder.
pub const MARKERS_FILE: &str = "markers.json";

/// What to do with now-playing info (from Settings).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Options {
    /// Fill in the tags of a recording of one song.
    pub tag: bool,
    /// Propose splits (an editor draft) for a recording of several songs.
    pub split: bool,
}

impl Options {
    pub fn any(&self) -> bool {
        self.tag || self.split
    }
}

// ------------------------------------------------------------- timeline

/// Don't checkpoint more often than this (an hour is ~72k points).
const CHECKPOINT_EVERY: Duration = Duration::from_millis(50);

/// When the audio reached the file: (wall-clock time, frames in the file by
/// then) checkpoints. Paused stretches add no frames, so a song change while
/// paused lands at the pause point; silence the trimmer drops before the
/// first sound adds none either, so changes before it land at 0.
#[derive(Debug, Default)]
pub struct Timeline {
    rate: u32,
    points: Vec<(SystemTime, u64)>,
}

impl Timeline {
    /// `frames` are in the file (or held back to be written) at `at`.
    pub fn record(&mut self, at: SystemTime, frames: u64, rate: u32) {
        self.rate = rate;
        if let Some(&(last_at, last_frames)) = self.points.last() {
            let soon = at.duration_since(last_at).unwrap_or_default() < CHECKPOINT_EVERY;
            if soon && frames != last_frames {
                // Keep the newest position of a burst in the last point.
                *self.points.last_mut().unwrap() = (at, frames);
                return;
            }
            if soon || frames < last_frames {
                return;
            }
        }
        self.points.push((at, frames));
    }

    /// Where in the file the audio playing at `t` landed.
    pub fn frames_at(&self, t: SystemTime) -> u64 {
        let Some(&(first_at, first_frames)) = self.points.first() else {
            return 0;
        };
        if t <= first_at {
            return first_frames.saturating_sub(self.frames_in(first_at, t));
        }
        let i = self.points.partition_point(|&(at, _)| at <= t) - 1;
        let (at, frames) = self.points[i];
        let ahead = self.frames_in(t, at);
        match self.points.get(i + 1) {
            Some(&(_, next)) => frames + ahead.min(next - frames),
            // Past the last checkpoint: the recording has ended (or the
            // change hasn't reached the file yet).
            None => frames,
        }
    }

    /// Frames played between `earlier` and `later` at full speed.
    fn frames_in(&self, later: SystemTime, earlier: SystemTime) -> u64 {
        let d = later.duration_since(earlier).unwrap_or_default();
        (d.as_secs_f64() * f64::from(self.rate)) as u64
    }
}

// ---------------------------------------------------------- silence map

/// Quieter than this counts as silence (-60 dBFS, as `trim.rs`).
const SILENCE: f32 = 0.001;
/// Shorter quiet runs are inside a song.
const MIN_GAP: Duration = Duration::from_millis(150);

/// The quiet runs of the file, as it's written.
#[derive(Debug, Default)]
pub struct SilenceMap {
    rate: u32,
    pos: u64,
    run_start: Option<u64>,
    runs: Vec<(u64, u64)>,
}

impl SilenceMap {
    /// Takes interleaved stereo just written to the file.
    pub fn push(&mut self, stereo: &[f32], rate: u32) {
        self.rate = rate;
        for frame in stereo.as_chunks::<2>().0 {
            let quiet = frame.iter().all(|s| s.abs() <= SILENCE);
            match (quiet, self.run_start) {
                (true, None) => self.run_start = Some(self.pos),
                (false, Some(start)) => {
                    self.close(start, self.pos);
                    self.run_start = None;
                }
                _ => {}
            }
            self.pos += 1;
        }
    }

    /// The quiet runs, including one still open at the end.
    pub fn runs(&self) -> Vec<(u64, u64)> {
        let mut runs = self.runs.clone();
        if let Some(start) = self.run_start
            && self.long_enough(start, self.pos)
        {
            runs.push((start, self.pos));
        }
        runs
    }

    fn close(&mut self, start: u64, end: u64) {
        if self.long_enough(start, end) {
            self.runs.push((start, end));
        }
    }

    fn long_enough(&self, start: u64, end: u64) -> bool {
        (end - start) as f64 >= MIN_GAP.as_secs_f64() * f64::from(self.rate)
    }
}

// ------------------------------------------------------------ collector

/// A song as the collector saw it, before it's placed in the file.
#[derive(Debug, Clone, PartialEq)]
pub struct Seen {
    /// Estimated start, in frames of the file.
    pub frames: u64,
    pub track: Track,
    /// The recording started mid-song.
    pub joined: bool,
}

/// Follows the now-playing service for one recording.
pub struct Session {
    watcher: Watcher,
    collector: JoinHandle<Vec<Seen>>,
}

impl Session {
    /// Starts following the player `source` captures. `None` when the OS
    /// has no now-playing service (the recording goes on without).
    pub fn start(
        backend: Box<dyn NowPlayingBackend>,
        source: &CaptureSource,
        timeline: Arc<Mutex<Timeline>>,
    ) -> Option<Self> {
        let (watcher, events) = Watcher::start(backend, target(source)).ok()?;
        let collector = std::thread::Builder::new()
            .name("sound-scraper-nowplaying".into())
            .spawn(move || {
                let mut seen = Vec::new();
                // Ends when the watcher stops and drops its sender.
                for event in events {
                    collect(&mut seen, event, &timeline.lock().unwrap());
                }
                seen
            })
            .ok()?;
        Some(Self { watcher, collector })
    }

    /// Stops following; returns the songs seen.
    pub fn finish(self) -> Vec<Seen> {
        self.watcher.stop();
        self.collector.join().unwrap_or_default()
    }
}

fn target(source: &CaptureSource) -> Target {
    match source {
        CaptureSource::System { .. } => Target::System,
        CaptureSource::App { app } => Target::App {
            pid: app.pid,
            bundle_id: app.bundle_id.clone(),
            name: app.name.clone(),
        },
    }
}

/// Joined further into a song than this, it's partial.
const JOINED_PARTIAL: Duration = Duration::from_secs(2);

fn collect(seen: &mut Vec<Seen>, event: WatchEvent, timeline: &Timeline) {
    match event {
        WatchEvent::TrackChanged(TrackChange {
            started_at,
            joined_at,
            track,
            ..
        }) => seen.push(Seen {
            frames: timeline.frames_at(started_at),
            track,
            joined: joined_at > JOINED_PARTIAL,
        }),
        WatchEvent::TrackUpdated(track) => {
            if let Some(last) = seen.last_mut() {
                last.track = track;
            }
        }
        WatchEvent::Paused { .. } | WatchEvent::Resumed { .. } => {}
    }
}

// -------------------------------------------------------------- markers

/// Each change is snapped to a quiet run this close to it.
const SNAP_WINDOW: Duration = Duration::from_secs(3);
/// A snapped split sits this far before the sound resumes (as Find Tracks).
const LEAD_IN: Duration = Duration::from_millis(200);
/// A song cut shorter than its length by more than this is partial.
const CUT_SHORT: Duration = Duration::from_secs(10);
/// Songs starting this close to the end of the file have no audio in it.
const TOO_LATE: Duration = Duration::from_secs(1);

/// Places the songs in a file of `total` frames at `rate`.
pub fn markers(seen: &[Seen], silences: &[(u64, u64)], total: u64, rate: u32) -> Vec<Marker> {
    place(seen, silences, total, rate)
        .into_iter()
        .map(|(m, _)| m)
        .collect()
}

/// The markers, each with the index of the song in `seen` it's from.
fn place(seen: &[Seen], silences: &[(u64, u64)], total: u64, rate: u32) -> Vec<(Marker, usize)> {
    let to_ms = |frames: u64| frames as f64 * 1000.0 / f64::from(rate);
    let frames_of = |d: Duration| (d.as_secs_f64() * f64::from(rate)) as u64;

    let mut placed: Vec<(u64, bool, usize)> = Vec::new();
    for (index, s) in seen.iter().enumerate() {
        if s.track.title.as_deref().is_none_or(|t| t.trim().is_empty()) {
            continue;
        }
        if placed
            .last()
            .is_some_and(|&(_, _, p)| same_song(&seen[p].track, &s.track))
        {
            continue;
        }
        // The first song starts the file, wherever it was first seen.
        let (at, snapped) = if placed.is_empty() {
            (0, true)
        } else {
            snap(
                s.frames,
                silences,
                frames_of(SNAP_WINDOW),
                frames_of(LEAD_IN),
            )
        };
        if at + frames_of(TOO_LATE) >= total {
            continue;
        }
        // Two songs at one point: the later one names the track.
        if placed.last().is_some_and(|(p, _, _)| *p >= at) {
            placed.pop();
        }
        placed.push((at, snapped, index));
    }

    let mut out = Vec::with_capacity(placed.len());
    for (i, &(at, snapped, index)) in placed.iter().enumerate() {
        let s = &seen[index];
        let end = placed.get(i + 1).map_or(total, |p| p.0);
        let cut_short = s
            .track
            .duration
            .is_some_and(|d| frames_of(d) > (end - at) + frames_of(CUT_SHORT));
        let at = if i == 0 { 0 } else { at };
        out.push((
            Marker {
                at_ms: to_ms(at),
                title: s.track.title.clone().unwrap_or_default().trim().to_string(),
                tags: TrackTags::default(),
                partial: s.joined || cut_short,
                ad: is_ad(&s.track),
                unsnapped: !snapped,
            },
            index,
        ));
    }
    out
}

/// The split for a change estimated at `at`: just before the end of the
/// nearest quiet run within `window`, else the estimate itself.
fn snap(at: u64, silences: &[(u64, u64)], window: u64, lead_in: u64) -> (u64, bool) {
    let distance = |&(a, b): &(u64, u64)| a.saturating_sub(at).max(at.saturating_sub(b));
    silences
        .iter()
        .filter(|g| distance(g) <= window)
        .min_by_key(|g| distance(g))
        .map_or((at, false), |&(a, b)| {
            (b.saturating_sub(lead_in).max(a), true)
        })
}

/// As the watcher's: different ids mean different songs, equal ids prove
/// nothing (Firefox uses one for every video).
fn same_song(a: &Track, b: &Track) -> bool {
    if let (Some(x), Some(y)) = (&a.id, &b.id)
        && x != y
    {
        return false;
    }
    let norm = |s: &Option<String>| s.as_deref().unwrap_or("").trim().to_lowercase();
    norm(&a.title) == norm(&b.title)
        && norm(&a.artist) == norm(&b.artist)
        && norm(&a.album) == norm(&b.album)
}

/// Spotify Free and YouTube (in a browser) report their ads as tracks.
fn is_ad(track: &Track) -> bool {
    let lower = |s: &Option<String>| s.as_deref().unwrap_or("").trim().to_lowercase();
    let (title, artist) = (lower(&track.title), lower(&track.artist));
    title == "advertisement"
        || title == "video ad"
        || artist.starts_with("youtube ads")
        || (artist.is_empty() && track.album.is_none() && title == "spotify")
}

// ------------------------------------------------------------- outcome

/// What happened to a recording's now-playing info on Stop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// No songs were seen (or the options are off).
    Nothing,
    /// One song: its tags were written to the file.
    Tagged,
    /// Several songs: a draft with this many tracks awaits review.
    Proposed { tracks: usize },
}

/// Applies the songs seen to the finished recording `path` (`total` frames
/// at `rate`): tags for one song, an editor draft for several. Markers are
/// kept in the draft folder either way, for the editor to show.
pub fn apply(
    path: &std::path::Path,
    seen: &[Seen],
    silences: &[(u64, u64)],
    total: u64,
    rate: u32,
    options: Options,
    version: TagVersion,
) -> Result<Outcome, String> {
    if !options.any() || rate == 0 {
        return Ok(Outcome::Nothing);
    }
    let file_name = path
        .file_name()
        .ok_or("recording has no file name")?
        .to_string_lossy()
        .to_string();
    let mut placed = place(seen, silences, total, rate);
    let songs: Vec<&(Marker, usize)> = placed.iter().filter(|(m, _)| !m.ad).collect();
    match songs.as_slice() {
        [] => return Ok(Outcome::Nothing),
        [(song, index)] => {
            if !options.tag {
                return Ok(Outcome::Nothing);
            }
            tag_file(path, &song.title, &seen[*index].track, version)?;
            return Ok(Outcome::Tagged);
        }
        _ if !options.split => return Ok(Outcome::Nothing),
        _ => {}
    }

    if options.tag {
        for (m, index) in &mut placed {
            m.tags = track_tags(&file_name, &seen[*index].track);
        }
    }
    let markers: Vec<Marker> = placed.into_iter().map(|(m, _)| m).collect();
    save_markers(&file_name, &markers)?;
    let draft = draft(&markers, total, rate);
    edits::save_draft(&file_name, &draft)?;
    Ok(Outcome::Proposed {
        tracks: markers.len(),
    })
}

/// The editor draft for the markers: a track per song, ads marked for
/// deletion (the user can keep them). Partial songs stay; the editor flags
/// them from the markers.
pub fn draft(markers: &[Marker], total: u64, rate: u32) -> EditList {
    let total_ms = total as f64 * 1000.0 / f64::from(rate);
    let mut list = EditList::default();
    for (i, m) in markers.iter().enumerate() {
        let tags = (m.tags != TrackTags::default()).then(|| m.tags.clone());
        if i == 0 {
            list.first_name = m.title.clone();
            list.first_tags = tags;
        } else {
            list.splices.push(Splice {
                at_ms: m.at_ms,
                name: m.title.clone(),
                tags,
            });
        }
        if m.ad {
            let end = markers.get(i + 1).map_or(total_ms, |n| n.at_ms);
            list.deleted.push(Region {
                start_ms: m.at_ms,
                end_ms: end,
            });
        }
    }
    list
}

fn track_tags(file_name: &str, track: &Track) -> TrackTags {
    let cover = track
        .artwork
        .as_ref()
        .and_then(|a| edits::store_cover(file_name, &a.mime, &a.data).ok());
    TrackTags {
        artist: non_empty(&track.artist),
        album: non_empty(&track.album),
        album_artist: non_empty(&track.album_artist),
        genre: non_empty(&track.genre),
        track: track.track_number.filter(|&n| n > 0),
        cover,
        ..TrackTags::default()
    }
}

fn non_empty(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn save_markers(file_name: &str, markers: &[Marker]) -> Result<(), String> {
    let dir = edits::draft_dir(file_name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    let path = dir.join(MARKERS_FILE);
    let json = serde_json::to_string_pretty(markers).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("writing {}: {e}", path.display()))
}

/// The markers saved for a recording, if any.
pub fn load_markers(file_name: &str) -> Vec<Marker> {
    std::fs::read_to_string(edits::draft_dir(file_name).join(MARKERS_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Writes one song's tags to the recording; its file name stays.
fn tag_file(
    path: &std::path::Path,
    title: &str,
    track: &Track,
    version: TagVersion,
) -> Result<(), String> {
    let some = |s: &Option<String>| non_empty(s).map(Some);
    let mut edit = TagEdit {
        title: Some(Some(title.to_string())),
        artist: some(&track.artist),
        album: some(&track.album),
        album_artist: some(&track.album_artist),
        genre: some(&track.genre),
        track: track.track_number.filter(|&n| n > 0).map(Some),
        ..TagEdit::default()
    };
    // `tags::write` takes covers from a file.
    let cover_file = track.artwork.as_ref().and_then(|art| {
        let file = std::env::temp_dir().join(format!(
            "sound-scraper-cover-{}-{:016x}.{}",
            std::process::id(),
            crate::library::fnv1a(&art.data),
            tags::cover_extension(&art.mime)
        ));
        std::fs::write(&file, &art.data).ok().map(|_| file)
    });
    if let Some(file) = &cover_file {
        edit.cover = CoverEdit::Set(file.clone());
    }
    let result = tags::write(path, &edit, version);
    if let Some(file) = cover_file {
        let _ = std::fs::remove_file(file);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1000; // 1 frame = 1 ms

    fn t(ms: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_millis(1_000_000 + ms)
    }

    fn song(title: &str, frames: u64) -> Seen {
        Seen {
            frames,
            track: Track {
                title: Some(title.into()),
                artist: Some("Artist".into()),
                duration: None,
                ..Track::default()
            },
            joined: false,
        }
    }

    #[test]
    fn given_steady_recording_when_mapping_times_then_frames_interpolate() {
        let mut tl = Timeline::default();
        for i in 0..=10 {
            tl.record(t(i * 100), i * 100, RATE);
        }
        assert_eq!(tl.frames_at(t(450)), 450);
        assert_eq!(tl.frames_at(t(0)), 0);
        // Before the first checkpoint: clamps at 0.
        assert_eq!(tl.frames_at(t(0) - Duration::from_secs(5)), 0);
        // After the last: clamps at the end.
        assert_eq!(tl.frames_at(t(5000)), 1000);
    }

    #[test]
    fn given_a_pause_when_mapping_a_time_inside_it_then_it_lands_at_the_pause_point() {
        let mut tl = Timeline::default();
        tl.record(t(0), 0, RATE);
        tl.record(t(1000), 1000, RATE);
        // Paused for 5 s: the next chunk adds 10 frames.
        tl.record(t(6000), 1010, RATE);
        assert_eq!(tl.frames_at(t(3000)), 1010);
        assert_eq!(tl.frames_at(t(1005)), 1005);
    }

    #[test]
    fn given_leading_silence_dropped_when_mapping_then_changes_before_the_sound_land_at_zero() {
        let mut tl = Timeline::default();
        tl.record(t(0), 0, RATE);
        tl.record(t(2000), 0, RATE);
        tl.record(t(2100), 100, RATE);
        assert_eq!(tl.frames_at(t(1000)), 0);
        assert_eq!(tl.frames_at(t(2050)), 50);
    }

    #[test]
    fn given_quiet_runs_when_pushing_audio_then_only_long_ones_are_kept() {
        let mut map = SilenceMap::default();
        let loud = vec![0.5f32; 2 * 500];
        let short_gap = vec![0.0f32; 2 * 100];
        let long_gap = vec![0.0f32; 2 * 400];
        map.push(&loud, RATE);
        map.push(&short_gap, RATE);
        map.push(&loud, RATE);
        map.push(&long_gap, RATE);
        map.push(&loud, RATE);
        assert_eq!(map.runs(), vec![(1100, 1500)]);
    }

    #[test]
    fn given_a_change_near_a_gap_when_placing_then_it_snaps_before_the_sound_resumes() {
        let seen = [song("One", 0), song("Two", 10_500)];
        let m = markers(&seen, &[(9_000, 10_000)], 20_000, RATE);
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].at_ms, 0.0);
        assert_eq!(m[1].at_ms, 9_800.0);
        assert!(!m[1].unsnapped);
    }

    #[test]
    fn given_no_gap_nearby_when_placing_then_the_estimate_stays_and_is_flagged() {
        let seen = [song("One", 0), song("Two", 10_500)];
        let m = markers(&seen, &[(2_000, 3_000)], 20_000, RATE);
        assert_eq!(m[1].at_ms, 10_500.0);
        assert!(m[1].unsnapped);
    }

    #[test]
    fn given_repeats_and_late_changes_when_placing_then_they_are_dropped() {
        let seen = [
            song("One", 0),
            song("One", 3_000),
            song("Two", 10_000),
            song("Three", 19_500),
        ];
        let m = markers(&seen, &[], 20_000, RATE);
        let titles: Vec<_> = m.iter().map(|m| m.title.as_str()).collect();
        assert_eq!(titles, ["One", "Two"]);
    }

    #[test]
    fn given_a_first_song_seen_late_when_placing_then_it_starts_the_file() {
        let seen = [song("One", 400)];
        let m = markers(&seen, &[], 20_000, RATE);
        assert_eq!(m[0].at_ms, 0.0);
    }

    #[test]
    fn given_joined_skipped_and_ads_when_placing_then_they_are_flagged() {
        let mut first = song("One", 0);
        first.joined = true;
        let mut skipped = song("Two", 5_000);
        skipped.track.duration = Some(Duration::from_secs(200));
        let mut ad = song("Advertisement", 10_000);
        ad.track.artist = None;
        let seen = [first, skipped, ad, song("Four", 20_000)];
        let m = markers(&seen, &[], 60_000, RATE);
        assert!(m[0].partial);
        assert!(m[1].partial);
        assert!(m[2].ad);
        assert!(!m[3].partial && !m[3].ad);
    }

    #[test]
    fn given_youtube_ads_and_a_shared_track_id_when_placing_then_songs_split_and_ads_flagged() {
        let mut song_one = song("Choosin' Texas", 0);
        song_one.track.id = Some("/org/mpris/MediaPlayer2/firefox".into());
        let mut ad = song("Video Ad", 10_000);
        ad.track.artist = Some("YouTube Ads 310".into());
        ad.track.id = song_one.track.id.clone();
        let m = markers(&[song_one, ad], &[], 20_000, RATE);
        assert_eq!(m.len(), 2);
        assert!(!m[0].ad);
        assert!(m[1].ad);
    }

    #[test]
    fn given_markers_when_drafting_then_tracks_are_named_and_only_ads_deleted() {
        let m = vec![
            Marker {
                at_ms: 0.0,
                title: "One".into(),
                tags: TrackTags {
                    artist: Some("A".into()),
                    ..TrackTags::default()
                },
                partial: true, // kept: only ads are deleted
                ad: false,
                unsnapped: false,
            },
            Marker {
                at_ms: 5_000.0,
                title: "Advertisement".into(),
                tags: TrackTags::default(),
                partial: false,
                ad: true,
                unsnapped: false,
            },
            Marker {
                at_ms: 8_000.0,
                title: "Three".into(),
                tags: TrackTags::default(),
                partial: false,
                ad: false,
                unsnapped: true,
            },
        ];
        let d = draft(&m, 20_000, RATE);
        assert_eq!(d.first_name, "One");
        assert_eq!(d.first_tags.unwrap().artist.as_deref(), Some("A"));
        assert_eq!(d.splices.len(), 2);
        assert_eq!(d.splices[1].name, "Three");
        assert!(d.splices[1].tags.is_none());
        assert_eq!(
            d.deleted,
            vec![Region {
                start_ms: 5_000.0,
                end_ms: 8_000.0
            }]
        );
    }
}

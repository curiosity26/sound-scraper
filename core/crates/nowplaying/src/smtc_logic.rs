//! The OS-independent rules of the SMTC backend (`windows.rs`): matching
//! AppUserModelIDs to processes, Windows time units, artwork sniffing and
//! seek detection. Kept apart from the WinRT calls so their tests run on any
//! host.

// Off Windows only the tests use these.
#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::{
    collections::{HashMap, HashSet},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// WinRT `TimeSpan`/`DateTime` count 100 ns ticks.
const TICKS_PER_SECOND: u64 = 10_000_000;
const NANOS_PER_TICK: u64 = 100;
/// Ticks from 1601-01-01 (the `DateTime` epoch) to 1970-01-01.
const TICKS_1601_TO_1970: i64 = 116_444_736_000_000_000;

/// Bigger "thumbnails" are not cover art we want to carry around.
pub(crate) const MAX_ARTWORK_BYTES: u64 = 10 * 1024 * 1024;

/// A timeline position this far from where playback should be is a seek.
/// Players update their timeline every few seconds with some jitter, so
/// smaller differences are noise.
pub(crate) const SEEK_THRESHOLD: Duration = Duration::from_secs(2);

/// A WinRT `TimeSpan` as a `Duration`; negative spans have no meaning here.
pub(crate) fn ticks_to_duration(ticks: i64) -> Option<Duration> {
    let ticks = u64::try_from(ticks).ok()?;
    let nanos = (ticks % TICKS_PER_SECOND) * NANOS_PER_TICK;
    Some(Duration::new(ticks / TICKS_PER_SECOND, nanos as u32))
}

/// A WinRT `DateTime` (ticks since 1601-01-01 UTC) as a `SystemTime`. Zero
/// or less is what SMTC reports when it never got a time.
pub(crate) fn datetime_to_system_time(ticks: i64) -> Option<SystemTime> {
    if ticks <= 0 {
        return None;
    }
    let since_1970 = ticks.checked_sub(TICKS_1601_TO_1970)?;
    if since_1970 >= 0 {
        UNIX_EPOCH.checked_add(ticks_to_duration(since_1970)?)
    } else {
        UNIX_EPOCH.checked_sub(ticks_to_duration(since_1970.checked_neg()?)?)
    }
}

/// What a session's timeline properties say, in our units.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Timeline {
    pub position: Option<Duration>,
    pub duration: Option<Duration>,
    pub position_at: Option<SystemTime>,
}

/// Reads the raw `GetTimelineProperties` ticks. Players without a timeline
/// leave everything at zero, which must not read as "at 0:00 of a 0:00
/// track".
pub(crate) fn timeline(start: i64, end: i64, position: i64, last_updated: i64) -> Timeline {
    let duration = end
        .checked_sub(start)
        .filter(|&d| d > 0)
        .and_then(ticks_to_duration);
    if duration.is_none() && position <= 0 && last_updated <= 0 {
        return Timeline::default();
    }
    // Position is on the StartTime..EndTime scale; StartTime is 0 for
    // ordinary tracks.
    let from_start = position.checked_sub(start).filter(|&p| p >= 0);
    Timeline {
        position: ticks_to_duration(from_start.unwrap_or(position)),
        duration,
        position_at: datetime_to_system_time(last_updated),
    }
}

/// SMTC uses empty strings for "unknown".
pub(crate) fn non_empty(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// SMTC uses 0 for an unknown track number or count.
pub(crate) fn positive(n: i32) -> Option<u32> {
    u32::try_from(n).ok().filter(|&n| n > 0)
}

/// Our tags hold one genre string; keep every genre the player gave.
pub(crate) fn join_genres<I: IntoIterator<Item = String>>(genres: I) -> Option<String> {
    let genres: Vec<String> = genres.into_iter().filter_map(|g| non_empty(&g)).collect();
    (!genres.is_empty()).then(|| genres.join("; "))
}

/// The artwork's MIME type, from its first bytes when they are JPEG or PNG
/// (stream content types are often missing or generic), else from the
/// stream's content type when that names an image. `None` means "not an
/// image we can use".
pub(crate) fn artwork_mime(data: &[u8], content_type: &str) -> Option<String> {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg".into());
    }
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return Some("image/png".into());
    }
    let content_type = content_type.trim().to_ascii_lowercase();
    (!data.is_empty() && content_type.starts_with("image/") && content_type.len() > 6)
        .then_some(content_type)
}

/// Whether two AppUserModelIDs name the same app (Windows compares them
/// case-insensitively).
pub(crate) fn aumids_equal(a: &str, b: &str) -> bool {
    !a.is_empty() && a.eq_ignore_ascii_case(b)
}

/// Whether a session AUMID names the process running `exe` (an image file
/// name such as `Spotify.exe`), for unpackaged apps that have no AUMID of
/// their own to compare:
/// - Win32 apps without an explicit AUMID get their exe file name
///   (`Spotify.exe`): exact, case-insensitive match.
/// - Heuristic: apps that set a short AUMID, often named after their
///   executable (`Chrome` for chrome.exe, `MSEdge` for msedge.exe), match
///   the exe stem once any `!App`-style suffix is dropped. This can miss
///   apps whose AUMID is unrelated to their exe (Firefox uses a hash) and,
///   in theory, match an unrelated exe that happens to share the name.
pub(crate) fn exe_matches_aumid(aumid: &str, exe: &str) -> bool {
    let aumid = aumid.trim();
    let exe = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    if aumid.is_empty() || exe.is_empty() {
        return false;
    }
    if aumid.eq_ignore_ascii_case(exe) {
        return true;
    }
    let app = aumid.split('!').next().unwrap_or(aumid);
    !app.is_empty() && app.eq_ignore_ascii_case(exe_stem(exe))
}

/// `chrome.exe` → `chrome`; other names unchanged.
fn exe_stem(exe: &str) -> &str {
    match exe.rsplit_once('.') {
        Some((stem, ext)) if ext.eq_ignore_ascii_case("exe") => stem,
        _ => exe,
    }
}

/// `root` and every process descending from it, given each process's
/// parent. Windows recycles PIDs, so a stale parent link can form a cycle;
/// each process is visited once.
pub(crate) fn process_tree(root: u32, parents: &HashMap<u32, u32>) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (&pid, &parent) in parents {
        if pid != parent {
            children.entry(parent).or_default().push(pid);
        }
    }
    let mut seen = HashSet::from([root]);
    let mut tree = vec![root];
    let mut next = 0;
    while let Some(&pid) = tree.get(next) {
        next += 1;
        for &child in children.get(&pid).into_iter().flatten() {
            if seen.insert(child) {
                tree.push(child);
            }
        }
    }
    tree
}

/// Where playback was at a known time, to tell seeks from the steady
/// progress that timeline updates also report.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Mark {
    pub position: Duration,
    pub at: SystemTime,
    pub playing: bool,
}

impl Mark {
    /// Where playback should be at `t` if nobody touched it.
    pub fn expected_at(&self, t: SystemTime) -> Duration {
        if !self.playing {
            return self.position;
        }
        self.position + t.duration_since(self.at).unwrap_or_default()
    }

    /// Records a play/pause at `now`. Players often skip the timeline
    /// update on pause, so the position is extrapolated to the moment of
    /// the change rather than kept from the last (older) update.
    pub fn set_playing(&mut self, playing: bool, now: SystemTime) {
        if playing != self.playing {
            *self = Mark {
                position: self.expected_at(now),
                at: now,
                playing,
            };
        }
    }

    /// Takes a new timeline reading; returns whether it jumped from where
    /// playback should be by more than [`SEEK_THRESHOLD`].
    pub fn advance(&mut self, position: Duration, at: SystemTime) -> bool {
        let jumped = position.abs_diff(self.expected_at(at)) > SEEK_THRESHOLD;
        self.position = position;
        self.at = at;
        jumped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: i64 = 10_000_000;

    #[test]
    fn ticks_become_durations() {
        assert_eq!(ticks_to_duration(0), Some(Duration::ZERO));
        assert_eq!(
            ticks_to_duration(3 * SECOND + 5),
            Some(Duration::new(3, 500))
        );
        assert_eq!(ticks_to_duration(-1), None);
    }

    #[test]
    fn datetimes_become_system_times() {
        assert_eq!(datetime_to_system_time(0), None);
        assert_eq!(datetime_to_system_time(-5), None);
        assert_eq!(
            datetime_to_system_time(TICKS_1601_TO_1970),
            Some(UNIX_EPOCH)
        );
        // 2026-11-01T00:00:00Z is 1_793_491_200 s after the Unix epoch.
        let ticks = TICKS_1601_TO_1970 + 1_793_491_200 * SECOND + 2_500_000;
        assert_eq!(
            datetime_to_system_time(ticks),
            Some(UNIX_EPOCH + Duration::new(1_793_491_200, 250_000_000))
        );
        // Before 1970 still converts (1969-12-31T23:59:59Z).
        assert_eq!(
            datetime_to_system_time(TICKS_1601_TO_1970 - SECOND),
            Some(UNIX_EPOCH - Duration::from_secs(1))
        );
    }

    #[test]
    fn empty_timelines_have_no_position() {
        assert_eq!(timeline(0, 0, 0, 0), Timeline::default());
    }

    #[test]
    fn timelines_convert() {
        let at = TICKS_1601_TO_1970 + 100 * SECOND;
        let t = timeline(0, 200 * SECOND, 42 * SECOND, at);
        assert_eq!(t.position, Some(Duration::from_secs(42)));
        assert_eq!(t.duration, Some(Duration::from_secs(200)));
        assert_eq!(t.position_at, Some(UNIX_EPOCH + Duration::from_secs(100)));

        // Live streams: no length, but a position.
        let t = timeline(0, 0, 5 * SECOND, at);
        assert_eq!(t.duration, None);
        assert_eq!(t.position, Some(Duration::from_secs(5)));

        // Position counts from StartTime.
        let t = timeline(10 * SECOND, 70 * SECOND, 25 * SECOND, at);
        assert_eq!(t.position, Some(Duration::from_secs(15)));
        assert_eq!(t.duration, Some(Duration::from_secs(60)));
    }

    #[test]
    fn unknown_texts_and_numbers_are_missing() {
        assert_eq!(non_empty(""), None);
        assert_eq!(non_empty("  "), None);
        assert_eq!(non_empty(" Song "), Some("Song".into()));
        assert_eq!(positive(0), None);
        assert_eq!(positive(-3), None);
        assert_eq!(positive(7), Some(7));
        assert_eq!(join_genres(Vec::new()), None);
        assert_eq!(join_genres(vec![String::new()]), None);
        assert_eq!(
            join_genres(vec!["Rock".into(), "".into(), "Pop".into()]),
            Some("Rock; Pop".into())
        );
    }

    #[test]
    fn artwork_mime_sniffs_magic_bytes_first() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0];
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A];
        assert_eq!(artwork_mime(&jpeg, ""), Some("image/jpeg".into()));
        assert_eq!(artwork_mime(&png, "image/jpeg"), Some("image/png".into()));
        assert_eq!(
            artwork_mime(b"RIFF....WEBP", "Image/WebP"),
            Some("image/webp".into())
        );
        assert_eq!(artwork_mime(b"<html>", "text/html"), None);
        assert_eq!(artwork_mime(b"????", ""), None);
        assert_eq!(artwork_mime(b"????", "image/"), None);
        assert_eq!(artwork_mime(&[], "image/png"), None);
    }

    #[test]
    fn exe_names_match_their_aumids() {
        // Win32 default AUMID: the exe name.
        assert!(exe_matches_aumid("Spotify.exe", "Spotify.exe"));
        assert!(exe_matches_aumid("spotify.exe", "SPOTIFY.EXE"));
        // Heuristic: short AUMIDs named after the exe.
        assert!(exe_matches_aumid("Chrome", "chrome.exe"));
        assert!(exe_matches_aumid("MSEdge", "msedge.exe"));
        assert!(exe_matches_aumid("vlc!App", "vlc.exe"));
        assert!(exe_matches_aumid(
            "Chrome",
            r"C:\Program Files\Google\chrome.exe"
        ));

        assert!(!exe_matches_aumid("Chrome", "chromedriver.exe"));
        assert!(!exe_matches_aumid("Spotify.exe", "chrome.exe"));
        assert!(!exe_matches_aumid(
            "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
            "Spotify.exe"
        ));
        assert!(!exe_matches_aumid("308046B0AF4A39CB", "firefox.exe"));
        assert!(!exe_matches_aumid("", "chrome.exe"));
        assert!(!exe_matches_aumid("!App", "App.exe"));
        assert!(!exe_matches_aumid("Chrome", ""));
    }

    #[test]
    fn aumids_compare_case_insensitively() {
        let spotify = "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify";
        assert!(aumids_equal(spotify, &spotify.to_lowercase()));
        assert!(!aumids_equal(
            spotify,
            "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"
        ));
        assert!(!aumids_equal("", ""));
    }

    #[test]
    fn process_trees_include_descendants_once() {
        // 1 → 2 → 3 → 6 → 7, 1 → 4, 5 unrelated.
        let parents = HashMap::from([(2, 1), (3, 2), (4, 1), (5, 0), (6, 3), (7, 6)]);
        let mut tree = process_tree(1, &parents);
        tree.sort();
        assert_eq!(tree, vec![1, 2, 3, 4, 6, 7]);

        let cycle = HashMap::from([(8, 9), (9, 8)]);
        let mut tree = process_tree(8, &cycle);
        tree.sort();
        assert_eq!(tree, vec![8, 9]);

        assert_eq!(process_tree(42, &HashMap::new()), vec![42]);
    }

    fn at(secs: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    fn secs(s: u64) -> Duration {
        Duration::from_secs(s)
    }

    #[test]
    fn steady_progress_is_not_a_seek() {
        let mut mark = Mark {
            position: secs(10),
            at: at(1000),
            playing: true,
        };
        assert!(!mark.advance(secs(15), at(1005)));
        assert!(!mark.advance(secs(21), at(1010)));
        assert_eq!(mark.position, secs(21));
    }

    #[test]
    fn jumps_while_playing_are_seeks() {
        let mut mark = Mark {
            position: secs(10),
            at: at(1000),
            playing: true,
        };
        assert!(mark.advance(secs(60), at(1005)));
        assert!(mark.advance(secs(0), at(1006)));
    }

    #[test]
    fn paused_players_do_not_advance() {
        let mut mark = Mark {
            position: secs(10),
            at: at(1000),
            playing: false,
        };
        assert!(!mark.advance(secs(10), at(1030)));
        assert!(mark.advance(secs(15), at(1031)));
    }

    #[test]
    fn pausing_extrapolates_the_position() {
        let mut mark = Mark {
            position: secs(10),
            at: at(1000),
            playing: true,
        };
        mark.set_playing(false, at(1020));
        assert_eq!(mark.position, secs(30));
        // The player's late timeline update at the pause point is no seek.
        assert!(!mark.advance(secs(30), at(1021)));
        mark.set_playing(true, at(1100));
        assert!(!mark.advance(secs(35), at(1105)));
        // Setting the same state again changes nothing.
        let before = mark;
        mark.set_playing(true, at(2000));
        assert_eq!(mark, before);
    }
}

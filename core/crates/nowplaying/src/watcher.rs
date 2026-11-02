//! Turns a backend's raw snapshots into clean track changes for one
//! capture target.
//!
//! The decisions live in [`Tracker`], a pure state machine fed events and
//! clock ticks, so they can be tested without threads or real time. The
//! [`Watcher`] only runs the backend and feeds the tracker from a thread.
//!
//! What the tracker smooths over:
//! - Players send metadata in bursts (title, then artist, then art a few
//!   hundred ms later), so a new song is only reported once its title has
//!   been stable for [`WatcherConfig::debounce`]; later details become one
//!   [`WatchEvent::TrackUpdated`] per real change.
//! - Spotify on Windows reports empty fields between songs: snapshots
//!   without a title are ignored.
//! - Seeks are never track changes.
//! - A replay of the same song (repeat-one) is a new track only by the
//!   simple rule: the same song comes back near its start (within
//!   [`REPLAY_START_WINDOW`]) after playback had passed
//!   [`REPLAY_PROGRESS`] of its duration. Players that skip back without a
//!   duration or position are not detected.

use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::{Duration, SystemTime},
};

use crate::{
    BackendEvent, NowPlayingBackend, NowPlayingError, PlaybackState, PlayerId, Snapshot, Target,
    Track,
};

/// A first track already further in than this when first seen means the
/// recording joined mid-song.
pub const JOINED_THRESHOLD: Duration = Duration::from_secs(2);
/// Fraction of the duration playback must have passed for a restart of the
/// same song to count as a replay.
pub const REPLAY_PROGRESS: f64 = 0.9;
/// How close to the start the same song must come back to count as a replay.
pub const REPLAY_START_WINDOW: Duration = Duration::from_secs(5);

/// A new song started (or the first one seen after the watcher started).
#[derive(Debug, Clone, PartialEq)]
pub struct TrackChange {
    /// Best estimate of when the song started playing: the player's
    /// `position_at - position` when it reports position, else when the
    /// change was seen.
    pub started_at: SystemTime,
    /// Where in the song playback was at `started_at`; non-zero when the
    /// watcher joined mid-song (the first track of a recording).
    pub joined_at: Duration,
    pub track: Track,
    pub player: PlayerId,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WatchEvent {
    TrackChanged(TrackChange),
    /// Updated details for the current song (a late cover, artist, album),
    /// as the full merged track. Applies to the song of the last
    /// `TrackChanged`.
    TrackUpdated(Track),
    /// The followed player paused or stopped (or went away). Also sent once
    /// at start when the first followed player is not playing, since
    /// consumers assume playback until told otherwise.
    Paused {
        at: SystemTime,
    },
    /// It resumed.
    Resumed {
        at: SystemTime,
    },
}

/// Timing knobs; the defaults suit real players, tests shrink them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WatcherConfig {
    /// How long a new title must stay put before it is reported.
    pub debounce: Duration,
    /// How often the watcher thread wakes without events to fire debounces
    /// and check for `stop`.
    pub tick: Duration,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            debounce: Duration::from_millis(300),
            tick: Duration::from_millis(50),
        }
    }
}

/// Runs a backend on its own thread and reports [`WatchEvent`]s for
/// `target`.
pub struct Watcher {
    /// Shared with the thread, which asks it `owns` for app targets.
    backend: Arc<Mutex<Box<dyn NowPlayingBackend>>>,
    stopping: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Watcher {
    /// Starts `backend` and watches it with the default [`WatcherConfig`].
    pub fn start(
        backend: Box<dyn NowPlayingBackend>,
        target: Target,
    ) -> Result<(Self, Receiver<WatchEvent>), NowPlayingError> {
        Self::start_with(backend, target, WatcherConfig::default())
    }

    /// Starts `backend` and a thread that reports [`WatchEvent`]s for
    /// `target` on the returned receiver until [`Watcher::stop`] (or drop).
    pub fn start_with(
        backend: Box<dyn NowPlayingBackend>,
        target: Target,
        config: WatcherConfig,
    ) -> Result<(Self, Receiver<WatchEvent>), NowPlayingError> {
        let backend = Arc::new(Mutex::new(backend));
        let (raw_tx, raw_rx) = mpsc::channel();
        lock(&backend).start(raw_tx)?;
        let (out_tx, out_rx) = mpsc::channel();
        let stopping = Arc::new(AtomicBool::new(false));
        let tracker = Tracker::new(target, config, owns_via(Arc::clone(&backend)));
        let worker = Worker {
            raw: raw_rx,
            out: out_tx,
            stopping: Arc::clone(&stopping),
            tick: config.tick,
            tracker,
        };
        let thread = thread::Builder::new()
            .name("nowplaying-watcher".into())
            .spawn(move || worker.run());
        let thread = match thread {
            Ok(thread) => thread,
            Err(err) => {
                lock(&backend).stop();
                return Err(NowPlayingError::Os(format!("spawn watcher thread: {err}")));
            }
        };
        let watcher = Self {
            backend,
            stopping,
            thread: Some(thread),
        };
        Ok((watcher, out_rx))
    }

    /// Stops the backend and waits for the thread. Pending (not yet
    /// debounced) changes are dropped: they started too close to the end
    /// of the recording to matter.
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        let Some(thread) = self.thread.take() else {
            return;
        };
        self.stopping.store(true, Ordering::SeqCst);
        lock(&self.backend).stop();
        let _ = thread.join();
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// A poisoned lock only means a backend panicked mid-call; its state is
/// still the best we have, so keep using it rather than cascading panics.
fn lock<T: ?Sized>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn owns_via(backend: Arc<Mutex<Box<dyn NowPlayingBackend>>>) -> OwnsFn {
    Box::new(move |player, pid, bundle_id| lock(&backend).owns(player, pid, bundle_id))
}

/// The watcher thread: feeds the tracker events and ticks.
struct Worker {
    raw: Receiver<BackendEvent>,
    out: Sender<WatchEvent>,
    stopping: Arc<AtomicBool>,
    tick: Duration,
    tracker: Tracker,
}

impl Worker {
    fn run(mut self) {
        while !self.stopping.load(Ordering::SeqCst) {
            let events = match self.raw.recv_timeout(self.tick) {
                Ok(event) => self.tracker.on_event(event, SystemTime::now()),
                Err(RecvTimeoutError::Timeout) => self.tracker.on_tick(SystemTime::now()),
                Err(RecvTimeoutError::Disconnected) => break,
            };
            for event in events {
                // A dropped receiver just means nobody listens any more;
                // keep draining until stopped.
                let _ = self.out.send(event);
            }
        }
    }
}

/// `NowPlayingBackend::owns`, detached from the backend so the tracker
/// stays testable.
pub type OwnsFn = Box<dyn FnMut(&PlayerId, u32, Option<&str>) -> bool + Send>;

/// The watcher's decision logic as a pure state machine: feed it backend
/// events with [`Tracker::on_event`] and clock ticks with
/// [`Tracker::on_tick`]; both return what to report.
pub struct Tracker {
    target: Target,
    config: WatcherConfig,
    owns: OwnsFn,
    /// `owns` answers per player; it can be costly (PID trees) and does not
    /// change while the player exists.
    owned: HashMap<PlayerId, bool>,
    players: HashMap<PlayerId, PlayerEntry>,
    followed: Option<PlayerId>,
    /// The song of the last `TrackChanged`, with details merged since.
    current: Option<CurrentTrack>,
    /// A new song waiting for its title to settle.
    pending: Option<PendingTrack>,
    /// Whether the followed stream is playing; `None` until first known.
    playing: Option<bool>,
    /// Whether a `TrackChanged` was emitted yet (the first may join
    /// mid-song).
    emitted_any: bool,
}

struct PlayerEntry {
    snapshot: Snapshot,
    /// When it last went from not playing to playing, to prefer the most
    /// recently started player.
    playing_since: Option<SystemTime>,
}

struct CurrentTrack {
    track: Track,
}

struct PendingTrack {
    player: PlayerId,
    track: Track,
    /// When the first snapshot with this title arrived.
    first_seen: SystemTime,
    /// The latest position report for this song: bursts often send the new
    /// title with the old song's position first.
    position: Option<PositionReport>,
    /// The same song again (repeat-one): a change even though it matches
    /// the current one.
    replay: bool,
}

#[derive(Clone, Copy)]
struct PositionReport {
    position: Duration,
    at: SystemTime,
    playing: bool,
}

impl PositionReport {
    fn of(snapshot: &Snapshot) -> Option<Self> {
        Some(Self {
            position: snapshot.position?,
            at: snapshot.position_at?,
            playing: snapshot.state == PlaybackState::Playing,
        })
    }

    /// When the song started, if it played straight from the start.
    fn started_at(&self) -> SystemTime {
        self.at.checked_sub(self.position).unwrap_or(self.at)
    }

    /// The position at `time`, advancing only while playing.
    fn position_at(&self, time: SystemTime) -> Duration {
        if !self.playing {
            return self.position;
        }
        match time.duration_since(self.at) {
            Ok(ahead) => self.position + ahead,
            Err(behind) => self.position.saturating_sub(behind.duration()),
        }
    }
}

impl Tracker {
    /// `owns` answers [`NowPlayingBackend::owns`]; it is only asked for
    /// [`Target::App`].
    pub fn new(target: Target, config: WatcherConfig, owns: OwnsFn) -> Self {
        Self {
            target,
            config,
            owns,
            owned: HashMap::new(),
            players: HashMap::new(),
            followed: None,
            current: None,
            pending: None,
            playing: None,
            emitted_any: false,
        }
    }

    /// Takes one backend event seen at `now`.
    pub fn on_event(&mut self, event: BackendEvent, now: SystemTime) -> Vec<WatchEvent> {
        let mut out = self.on_tick(now);
        match event {
            BackendEvent::Updated(snapshot) => self.on_updated(*snapshot, now, &mut out),
            BackendEvent::Removed(player) => self.on_removed(&player, now, &mut out),
            BackendEvent::Seeked {
                player,
                position,
                at,
            } => self.on_seeked(&player, position, at),
        }
        out.extend(self.on_tick(now));
        out
    }

    /// Reports a pending song whose title has been stable long enough.
    pub fn on_tick(&mut self, now: SystemTime) -> Vec<WatchEvent> {
        let due = self.pending.as_ref().is_some_and(|pending| {
            now.duration_since(pending.first_seen).unwrap_or_default() >= self.config.debounce
        });
        let mut out = Vec::new();
        if due && let Some(pending) = self.pending.take() {
            self.fire(pending, &mut out);
        }
        out
    }

    fn on_updated(&mut self, mut snapshot: Snapshot, now: SystemTime, out: &mut Vec<WatchEvent>) {
        snapshot.track = snapshot.track.map(clean_track);
        let id = snapshot.player.clone();
        let playing = snapshot.state == PlaybackState::Playing;
        let previous = self.players.remove(&id);
        let playing_since = match &previous {
            Some(entry) if playing && entry.snapshot.state == PlaybackState::Playing => {
                entry.playing_since
            }
            _ if playing => Some(now),
            _ => None,
        };
        let replay = self.is_replay(previous.as_ref().map(|e| &e.snapshot), &snapshot);
        self.players.insert(
            id.clone(),
            PlayerEntry {
                snapshot,
                playing_since,
            },
        );
        if self.reselect(now, out) || self.followed.as_ref() == Some(&id) {
            self.follow_snapshot(now, replay, out);
        }
    }

    fn on_removed(&mut self, player: &PlayerId, now: SystemTime, out: &mut Vec<WatchEvent>) {
        self.players.remove(player);
        self.owned.remove(player);
        if self.reselect(now, out) {
            self.follow_snapshot(now, false, out);
        }
    }

    /// Seeks only move the stored position (so the replay rule sees where
    /// playback really was); they never change tracks.
    fn on_seeked(&mut self, player: &PlayerId, position: Duration, at: SystemTime) {
        if let Some(entry) = self.players.get_mut(player) {
            entry.snapshot.position = Some(position);
            entry.snapshot.position_at = Some(at);
        }
    }

    /// Picks the player to follow; returns whether it changed. Losing the
    /// followed player pauses the stream.
    fn reselect(&mut self, now: SystemTime, out: &mut Vec<WatchEvent>) -> bool {
        let next = self.choose_player();
        if next == self.followed {
            return false;
        }
        self.followed = next;
        self.pending = None;
        if self.followed.is_none() {
            self.set_playing(false, now, out);
        }
        true
    }

    /// The best playing eligible player (current session first, then the
    /// most recently started); else the followed one while it is still
    /// around; else, for an app target only, any of its players (a paused
    /// app still tells us its song). A system target follows nothing until
    /// something plays.
    fn choose_player(&mut self) -> Option<PlayerId> {
        let ids: Vec<PlayerId> = self.players.keys().cloned().collect();
        let eligible: Vec<PlayerId> = ids.into_iter().filter(|id| self.is_eligible(id)).collect();
        let followed = self.followed.as_ref();
        let playing = eligible
            .iter()
            .filter(|id| self.players[*id].snapshot.state == PlaybackState::Playing)
            .max_by_key(|id| {
                let entry = &self.players[*id];
                (
                    entry.snapshot.is_current,
                    entry.playing_since,
                    Some(*id) == followed,
                )
            });
        if let Some(id) = playing {
            return Some(id.clone());
        }
        if let Some(id) = followed.filter(|id| eligible.contains(id)) {
            return Some(id.clone());
        }
        if matches!(self.target, Target::System) {
            return None;
        }
        eligible
            .iter()
            .max_by_key(|id| (self.players[*id].snapshot.is_current, id.app_id.clone()))
            .cloned()
    }

    fn is_eligible(&mut self, player: &PlayerId) -> bool {
        let Target::App { pid, bundle_id, .. } = &self.target else {
            return true;
        };
        if let Some(&owned) = self.owned.get(player) {
            return owned;
        }
        let owned = (self.owns)(player, *pid, bundle_id.as_deref());
        self.owned.insert(player.clone(), owned);
        owned
    }

    /// Applies the followed player's latest snapshot: play state, then
    /// track.
    fn follow_snapshot(&mut self, now: SystemTime, replay: bool, out: &mut Vec<WatchEvent>) {
        let Some(entry) = self.followed.as_ref().and_then(|id| self.players.get(id)) else {
            return;
        };
        let snapshot = entry.snapshot.clone();
        let at = snapshot.position_at.unwrap_or(now);
        self.set_playing(snapshot.state == PlaybackState::Playing, at, out);
        if let Some(track) = snapshot.track.clone().filter(has_title) {
            self.follow_track(&snapshot, track, now, replay, out);
        }
    }

    fn set_playing(&mut self, playing: bool, at: SystemTime, out: &mut Vec<WatchEvent>) {
        let was = self.playing.replace(playing);
        match (was, playing) {
            (Some(false), true) => out.push(WatchEvent::Resumed { at }),
            (Some(true) | None, false) => out.push(WatchEvent::Paused { at }),
            _ => {}
        }
    }

    fn follow_track(
        &mut self,
        snapshot: &Snapshot,
        track: Track,
        now: SystemTime,
        replay: bool,
        out: &mut Vec<WatchEvent>,
    ) {
        let position = PositionReport::of(snapshot);
        if let Some(pending) = &mut self.pending
            && same_title(&pending.track, &track)
        {
            pending.track = merge(&pending.track, &track);
            pending.position = position.or(pending.position);
            return;
        }
        let is_current = self
            .current
            .as_ref()
            .is_some_and(|current| same_track(&current.track, &track));
        if is_current && !replay {
            // A flicker back to the current song cancels the pending one.
            self.pending = None;
            self.update_current(&track, out);
            return;
        }
        self.pending = Some(PendingTrack {
            player: snapshot.player.clone(),
            track,
            first_seen: now,
            position,
            replay,
        });
    }

    /// Merges `track` into the current song; reports only real changes.
    fn update_current(&mut self, track: &Track, out: &mut Vec<WatchEvent>) {
        let Some(current) = &mut self.current else {
            return;
        };
        let merged = merge(&current.track, track);
        if merged != current.track {
            current.track = merged.clone();
            out.push(WatchEvent::TrackUpdated(merged));
        }
    }

    fn fire(&mut self, pending: PendingTrack, out: &mut Vec<WatchEvent>) {
        let is_current = self
            .current
            .as_ref()
            .is_some_and(|current| same_track(&current.track, &pending.track));
        if is_current && !pending.replay {
            // Switched to a player on the same song: not a new track.
            self.update_current(&pending.track, out);
            return;
        }
        let (started_at, joined_at) = self.estimate_start(&pending);
        self.emitted_any = true;
        self.current = Some(CurrentTrack {
            track: pending.track.clone(),
        });
        out.push(WatchEvent::TrackChanged(TrackChange {
            started_at,
            joined_at,
            track: pending.track,
            player: pending.player,
        }));
    }

    /// From the player's position when it has one, else when the title
    /// first appeared. The first song after start that was already over
    /// [`JOINED_THRESHOLD`] in is a mid-song join: it "starts" when first
    /// seen, at that position.
    fn estimate_start(&self, pending: &PendingTrack) -> (SystemTime, Duration) {
        let Some(report) = pending.position else {
            return (pending.first_seen, Duration::ZERO);
        };
        let joined = report.position_at(pending.first_seen);
        if !self.emitted_any && joined > JOINED_THRESHOLD {
            return (pending.first_seen, joined);
        }
        (report.started_at(), Duration::ZERO)
    }

    /// The same song came back near its start after playback had passed
    /// [`REPLAY_PROGRESS`] of it (see the module docs).
    fn is_replay(&self, previous: Option<&Snapshot>, next: &Snapshot) -> bool {
        if self.followed.as_ref() != Some(&next.player) || self.pending.is_some() {
            return false;
        }
        let (Some(current), Some(previous), Some(track)) =
            (self.current.as_ref(), previous, next.track.as_ref())
        else {
            return false;
        };
        if !same_track(&current.track, track) {
            return false;
        }
        let (Some(before), Some(after)) = (PositionReport::of(previous), PositionReport::of(next))
        else {
            return false;
        };
        let Some(duration) = track.duration.or(current.track.duration) else {
            return false;
        };
        let reached = before.position_at(after.at).min(duration);
        reached.as_secs_f64() >= duration.as_secs_f64() * REPLAY_PROGRESS
            && after.position <= REPLAY_START_WINDOW
    }
}

/// Empty and whitespace-only text fields mean "unknown".
fn clean_track(mut track: Track) -> Track {
    for field in [
        &mut track.title,
        &mut track.artist,
        &mut track.album,
        &mut track.album_artist,
        &mut track.genre,
        &mut track.id,
    ] {
        if field.as_deref().is_some_and(|s| s.trim().is_empty()) {
            *field = None;
        }
    }
    track
}

fn has_title(track: &Track) -> bool {
    track.title.is_some()
}

fn normalized(text: Option<&String>) -> Option<String> {
    text.map(|s| s.trim().to_lowercase())
}

/// Whether two fields agree; a missing one agrees with anything, since
/// players fill fields in over a burst.
fn compatible(a: Option<&String>, b: Option<&String>) -> bool {
    match (normalized(a), normalized(b)) {
        (Some(a), Some(b)) => a == b,
        _ => true,
    }
}

/// Track identity: title, artist and album (trimmed, case-insensitive;
/// missing fields don't count). Different player ids always mean different
/// tracks, but equal ids prove nothing: Firefox reports one id for every
/// video it plays.
fn same_track(a: &Track, b: &Track) -> bool {
    if let (Some(a), Some(b)) = (&a.id, &b.id)
        && a != b
    {
        return false;
    }
    normalized(a.title.as_ref()) == normalized(b.title.as_ref())
        && compatible(a.artist.as_ref(), b.artist.as_ref())
        && compatible(a.album.as_ref(), b.album.as_ref())
}

/// While debouncing only the title matters: the artist may still be the
/// previous song's for a moment.
fn same_title(a: &Track, b: &Track) -> bool {
    if let (Some(a), Some(b)) = (&a.id, &b.id)
        && a != b
    {
        return false;
    }
    normalized(a.title.as_ref()) == normalized(b.title.as_ref())
}

/// `newer`'s known fields over `base`'s: snapshots drop fields they have
/// not loaded yet, which must not erase what we already know.
fn merge(base: &Track, newer: &Track) -> Track {
    let newer = newer.clone();
    Track {
        title: newer.title.or_else(|| base.title.clone()),
        artist: newer.artist.or_else(|| base.artist.clone()),
        album: newer.album.or_else(|| base.album.clone()),
        album_artist: newer.album_artist.or_else(|| base.album_artist.clone()),
        track_number: newer.track_number.or(base.track_number),
        track_count: newer.track_count.or(base.track_count),
        genre: newer.genre.or_else(|| base.genre.clone()),
        duration: newer.duration.or(base.duration),
        artwork: newer.artwork.or_else(|| base.artwork.clone()),
        id: newer.id.or_else(|| base.id.clone()),
    }
}

#[cfg(test)]
mod tests;

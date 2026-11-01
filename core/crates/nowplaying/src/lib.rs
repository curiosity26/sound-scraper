//! What the OS says is playing, for tagging and splitting recordings
//! (design doc: "Auto-tag and split from now-playing info").
//!
//! Capture APIs carry no metadata; each OS's "now playing" service does:
//! SMTC on Windows, MPRIS on Linux, MediaRemote on macOS. A
//! [`NowPlayingBackend`] reports raw [`Snapshot`]s from that service; the
//! [`watcher`] turns them into clean [`WatchEvent`]s (track changes, late
//! details, pauses) for one capture [`Target`].

use std::{
    fmt,
    sync::{Arc, mpsc::Sender},
    time::{Duration, SystemTime},
};

pub mod fake;
pub mod watcher;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub use watcher::{TrackChange, WatchEvent, Watcher, WatcherConfig};

/// Cover art as the player gave it.
#[derive(Clone, PartialEq, Eq)]
pub struct Artwork {
    /// "image/jpeg" or "image/png".
    pub mime: String,
    pub data: Arc<[u8]>,
}

impl fmt::Debug for Artwork {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Artwork({}, {} bytes)", self.mime, self.data.len())
    }
}

/// One track's metadata. Players omit what they don't know.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Track {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_count: Option<u32>,
    pub genre: Option<String>,
    pub duration: Option<Duration>,
    pub artwork: Option<Artwork>,
    /// The player's own id for the track when it has one (MPRIS
    /// `mpris:trackid`, MediaRemote `uniqueIdentifier`), to tell a replay of
    /// the same song from a pause.
    pub id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

/// Which player a snapshot is from.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PlayerId {
    /// Windows: the session's AppUserModelID (`Spotify.exe`, `Chrome`).
    /// Linux: the MPRIS bus name (`org.mpris.MediaPlayer2.spotify`).
    /// macOS: the bundle ID.
    pub app_id: String,
    /// The player's process, when the OS tells us.
    pub pid: Option<u32>,
    /// macOS: the parent app's bundle ID (Safari for WebKit playback).
    pub parent_app_id: Option<String>,
}

/// What one player reports right now.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    pub player: PlayerId,
    pub track: Option<Track>,
    pub state: PlaybackState,
    /// Playback position, true at `position_at`.
    pub position: Option<Duration>,
    pub position_at: Option<SystemTime>,
    /// The OS's own pick of the "current" session (Windows
    /// `GetCurrentSession`; macOS has only one).
    pub is_current: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BackendEvent {
    /// A player appeared or changed anything.
    Updated(Box<Snapshot>),
    /// A player went away.
    Removed(PlayerId),
    /// The position jumped (a seek, not a new track).
    Seeked {
        player: PlayerId,
        position: Duration,
        at: SystemTime,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NowPlayingError {
    /// No now-playing service on this OS or build (or it stopped answering,
    /// e.g. a future macOS closes the MediaRemote workaround).
    Unavailable(String),
    Os(String),
}

impl fmt::Display for NowPlayingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unavailable(why) => write!(f, "now playing unavailable: {why}"),
            Self::Os(msg) => write!(f, "now playing: {msg}"),
        }
    }
}

impl std::error::Error for NowPlayingError {}

/// The app a recording captures, as the capture picker knows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// All system audio: follow whichever player is playing.
    System,
    /// One app (its process and, on macOS, bundle ID).
    App {
        pid: u32,
        bundle_id: Option<String>,
        name: String,
    },
}

pub trait NowPlayingBackend: Send {
    /// Starts reporting to `sink`: first an `Updated` for every player
    /// already present, then changes as they happen. Reporting stops when
    /// `stop` is called or the backend is dropped.
    fn start(&mut self, sink: Sender<BackendEvent>) -> Result<(), NowPlayingError>;
    fn stop(&mut self);
    /// Whether `player` belongs to the captured app `pid` (or one of its
    /// child processes) / `bundle_id`. OS-specific: Windows compares the
    /// process's AppUserModelID and exe name, Linux the bus name's PID tree,
    /// macOS the bundle IDs.
    fn owns(&self, player: &PlayerId, pid: u32, bundle_id: Option<&str>) -> bool;
}

/// The now-playing backend for the OS this was built for.
pub fn default_backend() -> Box<dyn NowPlayingBackend> {
    #[cfg(target_os = "linux")]
    return Box::new(linux::Mpris::new());
    #[cfg(target_os = "windows")]
    return Box::new(windows::Smtc::new());
    #[cfg(target_os = "macos")]
    return Box::new(macos::MediaRemote::new());
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Box::new(fake::Unavailable);
}

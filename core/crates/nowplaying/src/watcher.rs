//! Turns a backend's raw snapshots into clean track changes for one
//! capture target. TODO(watcher agent): implement.

use std::{sync::mpsc::Receiver, time::SystemTime};

use crate::{NowPlayingBackend, NowPlayingError, PlayerId, Target, Track};

/// A new song started (or the first one seen after the watcher started).
#[derive(Debug, Clone, PartialEq)]
pub struct TrackChange {
    /// Best estimate of when the song started playing: the player's
    /// `position_at - position` when it reports position, else when the
    /// change was seen.
    pub started_at: SystemTime,
    /// Where in the song playback was at `started_at`; non-zero when the
    /// watcher joined mid-song (the first track of a recording).
    pub joined_at: std::time::Duration,
    pub track: Track,
    pub player: PlayerId,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WatchEvent {
    TrackChanged(TrackChange),
    /// Updated details for the current song (a late cover, artist, album).
    /// Applies to the song of the last `TrackChanged`.
    TrackUpdated(Track),
    /// The followed player paused or stopped.
    Paused {
        at: SystemTime,
    },
    /// It resumed.
    Resumed {
        at: SystemTime,
    },
}

/// Runs a backend on its own thread and reports [`WatchEvent`]s for
/// `target`.
pub struct Watcher {
    _private: (),
}

impl Watcher {
    pub fn start(
        _backend: Box<dyn NowPlayingBackend>,
        _target: Target,
    ) -> Result<(Self, Receiver<WatchEvent>), NowPlayingError> {
        Err(NowPlayingError::Unavailable(
            "watcher not implemented yet".into(),
        ))
    }

    pub fn stop(self) {}
}

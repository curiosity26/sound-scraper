//! Now-playing markers for a recording (design doc "Auto-tag and split from
//! now-playing info"): where each song starts in the file and its tags.
//! TODO(recorder agent): timeline, sidecar, Stop outcome.

use serde::{Deserialize, Serialize};

use crate::edit::edits::TrackTags;

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
    /// Joined mid-song, or skipped before its end.
    pub partial: bool,
    /// Looks like an ad (Spotify free).
    pub ad: bool,
    /// No silence was found near the change; the cut sits at the estimate.
    pub unsnapped: bool,
}

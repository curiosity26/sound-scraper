//! The edit list: splice marks and deleted regions, and the tracks they
//! make (docs/track-editor-design.md §4.4, §4.6). Plain data, exchanged with
//! the UI as JSON (times in milliseconds) and kept as a draft until saved.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EditList {
    /// The name of the first track (the one starting at 0).
    pub first_name: String,
    /// Where later tracks start, with their names.
    pub splices: Vec<Splice>,
    /// Stretches to leave out.
    pub deleted: Vec<Region>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Splice {
    pub at_ms: f64,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub start_ms: f64,
    pub end_ms: f64,
}

/// One track to write: its name and the stretches of the original it's made
/// of, in presentation frames.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackPlan {
    pub name: String,
    /// Where the track starts in the original (its splice, or 0), before
    /// any deleted stretch at its start.
    pub start: u64,
    pub segments: Vec<(u64, u64)>,
}

impl TrackPlan {
    pub fn frames(&self) -> u64 {
        self.segments.iter().map(|(a, b)| b - a).sum()
    }
}

/// Stretches shorter than this (~10 ms at 48 kHz) are dropped.
const MIN_SEGMENT_FRAMES: u64 = 480;

impl EditList {
    /// Nothing to save.
    pub fn is_empty(&self) -> bool {
        self.splices.is_empty() && self.deleted.is_empty()
    }

    /// The tracks to write for a recording of `total` frames at `rate`.
    /// Tracks left with no audio (wholly deleted) are skipped.
    pub fn plan(&self, rate: u32, total: u64) -> Vec<TrackPlan> {
        let to_frames =
            |ms: f64| ((ms.max(0.0) / 1000.0 * f64::from(rate)).round() as u64).min(total);
        let mut splices: Vec<(u64, &str)> = self
            .splices
            .iter()
            .map(|s| (to_frames(s.at_ms), s.name.as_str()))
            .collect();
        splices.sort_by_key(|s| s.0);
        let mut starts = vec![(0, self.first_name.as_str())];
        for (at, name) in splices {
            if at > starts.last().unwrap().0 && at < total {
                starts.push((at, name));
            } else if at == starts.last().unwrap().0 {
                // Two splices at one point: the later one names the track.
                starts.last_mut().unwrap().1 = name;
            }
        }
        let mut deleted: Vec<(u64, u64)> = self
            .deleted
            .iter()
            .map(|r| {
                (
                    to_frames(r.start_ms.min(r.end_ms)),
                    to_frames(r.start_ms.max(r.end_ms)),
                )
            })
            .filter(|(a, b)| b > a)
            .collect();
        deleted.sort();
        let mut tracks = Vec::new();
        for (i, &(start, name)) in starts.iter().enumerate() {
            let end = starts.get(i + 1).map_or(total, |s| s.0);
            let mut segments = Vec::new();
            let mut at = start;
            for &(a, b) in &deleted {
                if b <= at || a >= end {
                    continue;
                }
                if a > at {
                    segments.push((at, a));
                }
                at = at.max(b);
            }
            if at < end {
                segments.push((at, end));
            }
            segments.retain(|(a, b)| b - a >= MIN_SEGMENT_FRAMES);
            if !segments.is_empty() {
                let name = name.trim();
                tracks.push(TrackPlan {
                    start,
                    name: if name.is_empty() {
                        format!("Track {}", tracks.len() + 1)
                    } else {
                        name.to_string()
                    },
                    segments,
                });
            }
        }
        tracks
    }
}

// ---------------------------------------------------------------- drafts

fn drafts_dir() -> PathBuf {
    paths::editor_data_dir().join("Edits")
}

fn draft_path(dir: &Path, file_name: &str) -> PathBuf {
    dir.join(format!("{}.json", paths::sanitize(file_name)))
}

/// The unsaved edits for a recording, if any.
pub fn load_draft(file_name: &str) -> Option<EditList> {
    load_draft_in(&drafts_dir(), file_name)
}

pub fn save_draft(file_name: &str, edits: &EditList) -> Result<(), String> {
    save_draft_in(&drafts_dir(), file_name, edits)
}

pub fn discard_draft(file_name: &str) {
    let _ = std::fs::remove_file(draft_path(&drafts_dir(), file_name));
}

/// Keeps a draft with its recording when the recording is renamed.
pub fn rename_draft(old: &str, new: &str) {
    let dir = drafts_dir();
    let from = draft_path(&dir, old);
    if from.exists() {
        let _ = std::fs::rename(from, draft_path(&dir, new));
    }
}

fn load_draft_in(dir: &Path, file_name: &str) -> Option<EditList> {
    let text = std::fs::read_to_string(draft_path(dir, file_name)).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_draft_in(dir: &Path, file_name: &str, edits: &EditList) -> Result<(), String> {
    let path = draft_path(dir, file_name);
    if edits.is_empty() {
        let _ = std::fs::remove_file(path);
        return Ok(());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    let json = serde_json::to_string(edits).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(|e| format!("writing {}: {e}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("writing {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1000; // 1 frame = 1 ms

    fn splice(at: f64, name: &str) -> Splice {
        Splice {
            at_ms: at,
            name: name.into(),
        }
    }

    fn region(a: f64, b: f64) -> Region {
        Region {
            start_ms: a,
            end_ms: b,
        }
    }

    #[test]
    fn splices_make_tracks() {
        let e = EditList {
            first_name: "Intro".into(),
            splices: vec![splice(6000.0, "Two"), splice(3000.0, "One")],
            deleted: vec![],
        };
        let t = e.plan(RATE, 10_000);
        assert_eq!(
            t.iter()
                .map(|t| (t.name.as_str(), t.segments.clone()))
                .collect::<Vec<_>>(),
            vec![
                ("Intro", vec![(0, 3000)]),
                ("One", vec![(3000, 6000)]),
                ("Two", vec![(6000, 10_000)])
            ]
        );
    }

    #[test]
    fn deleted_regions_trim_and_split_tracks() {
        let e = EditList {
            first_name: "A".into(),
            splices: vec![splice(5000.0, "B")],
            // Trims A's start, cuts across the splice, and removes a middle
            // stretch of B.
            deleted: vec![
                region(0.0, 1000.0),
                region(4000.0, 5500.0),
                region(8000.0, 7000.0),
            ],
        };
        let t = e.plan(RATE, 10_000);
        assert_eq!(t[0].segments, vec![(1000, 4000)]);
        assert_eq!(t[1].segments, vec![(5500, 7000), (8000, 10_000)]);
        assert_eq!(t[1].frames(), 3500);
    }

    #[test]
    fn wholly_deleted_tracks_are_skipped_and_names_defaulted() {
        let e = EditList {
            first_name: " ".into(),
            splices: vec![
                splice(2000.0, "Gone"),
                splice(4000.0, "Kept"),
                splice(20_000.0, "Past the end"),
            ],
            deleted: vec![region(2000.0, 4000.0)],
        };
        let t = e.plan(RATE, 10_000);
        assert_eq!(
            t.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            vec!["Track 1", "Kept"]
        );
    }

    #[test]
    fn drafts_round_trip_and_empty_ones_are_removed() {
        let dir = paths::tempdir();
        let e = EditList {
            first_name: "x".into(),
            splices: vec![splice(1.5, "y")],
            deleted: vec![region(1.0, 2.0)],
        };
        save_draft_in(&dir, "a.mp3", &e).unwrap();
        assert_eq!(load_draft_in(&dir, "a.mp3"), Some(e));
        save_draft_in(&dir, "a.mp3", &EditList::default()).unwrap();
        assert_eq!(load_draft_in(&dir, "a.mp3"), None);
    }
}

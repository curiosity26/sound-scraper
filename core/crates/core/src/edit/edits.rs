//! The edit list: splice marks and deleted regions, and the tracks they
//! make (docs/track-editor-design.md §4.4, §4.6). Plain data, exchanged with
//! the UI as JSON (times in milliseconds) and kept as a draft until saved.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct EditList {
    /// The name of the first track (the one starting at 0).
    pub first_name: String,
    /// The first track's own tags, over the recording's.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub first_tags: Option<TrackTags>,
    /// Where later tracks start, with their names.
    pub splices: Vec<Splice>,
    /// Stretches to leave out.
    pub deleted: Vec<Region>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Splice {
    pub at_ms: f64,
    pub name: String,
    /// This track's own tags, over the recording's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub tags: Option<TrackTags>,
}

/// One track's tags in the editor, applied over the recording's own when the
/// track is saved. The name (title and file name) lives on the track itself.
/// `None` keeps the recording's value (and is left out of the JSON);
/// `Some("")` clears it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct TrackTags {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub album_artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub comment: Option<String>,
    /// Overrides the 1, 2, 3 numbering.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub track: Option<u32>,
    /// A cover stored in the draft's folder (its id from `store_cover`), or
    /// "" to save the track with no cover.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub cover: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Region {
    pub start_ms: f64,
    pub end_ms: f64,
}

impl TrackTags {
    /// No overrides: the track is tagged like the recording.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// One track to write: its name, its tags and the stretches of the original
/// it's made of, in presentation frames.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackPlan {
    pub name: String,
    /// The track's own tags (from `first_tags` or its splice).
    pub tags: TrackTags,
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
    /// Nothing to save: no splices, no deletions and no tag changes.
    pub fn is_empty(&self) -> bool {
        self.splices.is_empty()
            && self.deleted.is_empty()
            && self.first_tags.as_ref().is_none_or(TrackTags::is_empty)
    }

    /// Adds a splice at `at_ms` named `name`. The new track starts with the
    /// tags of the track it splits (its title is its own name). It goes
    /// after any splice already at that point, so it names the track there.
    pub fn add_splice(&mut self, at_ms: f64, name: &str) {
        let tags = self.tags_at(at_ms).cloned();
        self.splices.push(Splice {
            at_ms,
            name: name.to_string(),
            tags,
        });
    }

    /// The tags of the track playing at `at_ms`: those of the last splice at
    /// or before it (the later one in the list on a tie, as in `plan`), else
    /// the first track's.
    fn tags_at(&self, at_ms: f64) -> Option<&TrackTags> {
        let mut best: Option<&Splice> = None;
        for s in &self.splices {
            if s.at_ms <= at_ms && best.is_none_or(|b| s.at_ms >= b.at_ms) {
                best = Some(s);
            }
        }
        match best {
            Some(s) => s.tags.as_ref(),
            None => self.first_tags.as_ref(),
        }
    }

    /// The tracks to write for a recording of `total` frames at `rate`.
    /// Tracks left with no audio (wholly deleted) are skipped.
    pub fn plan(&self, rate: u32, total: u64) -> Vec<TrackPlan> {
        let to_frames =
            |ms: f64| ((ms.max(0.0) / 1000.0 * f64::from(rate)).round() as u64).min(total);
        let mut splices: Vec<(u64, &str, Option<&TrackTags>)> = self
            .splices
            .iter()
            .map(|s| (to_frames(s.at_ms), s.name.as_str(), s.tags.as_ref()))
            .collect();
        splices.sort_by_key(|s| s.0);
        let mut starts = vec![(0, self.first_name.as_str(), self.first_tags.as_ref())];
        for (at, name, tags) in splices {
            let last = starts.last_mut().unwrap();
            if at > last.0 && at < total {
                starts.push((at, name, tags));
            } else if at == last.0 {
                // Two splices at one point: the later one names (and tags)
                // the track.
                (last.1, last.2) = (name, tags);
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
        for (i, &(start, name, tags)) in starts.iter().enumerate() {
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
                    tags: tags.cloned().unwrap_or_default(),
                    segments,
                });
            }
        }
        tracks
    }
}

// ---------------------------------------------------------------- drafts
//
// Each recording's draft is a folder, `Edits/<sanitized file name>/`,
// holding `edits.json` (the EditList), `covers/` (store_cover) and whatever
// else the editor keeps for it (the recorder's now-playing markers). Older
// versions kept a single `Edits/<sanitized file name>.json`, moved into the
// folder when next loaded.

/// The edit list's file in a draft folder.
const EDITS_FILE: &str = "edits.json";
/// Cover images in a draft folder.
const COVERS_DIR: &str = "covers";

/// How long a draft whose recording is gone is kept before `sweep_orphans`
/// removes it (the recording may be on a drive that isn't mounted, or in a
/// folder the user switches back to).
pub const ORPHAN_GRACE: Duration = Duration::from_secs(30 * 24 * 60 * 60);

fn drafts_dir() -> PathBuf {
    paths::editor_data_dir().join("Edits")
}

fn folder_in(dir: &Path, file_name: &str) -> PathBuf {
    dir.join(paths::sanitize(file_name))
}

/// Where an old single-file draft lived.
fn old_draft_path(dir: &Path, file_name: &str) -> PathBuf {
    dir.join(format!("{}.json", paths::sanitize(file_name)))
}

/// The folder holding everything the editor keeps for one recording: the
/// edit list, now-playing markers and cover images. It may not exist yet.
pub fn draft_dir(file_name: &str) -> PathBuf {
    folder_in(&drafts_dir(), file_name)
}

/// Stores a cover image in the recording's draft folder; returns its id for
/// `TrackTags::cover`. Images are named by content, so one album's cover is
/// stored once.
pub fn store_cover(file_name: &str, mime: &str, data: &[u8]) -> Result<String, String> {
    store_cover_in(&drafts_dir(), file_name, mime, data)
}

/// Where a cover stored with `store_cover` lives, if it does.
pub fn cover_path(file_name: &str, id: &str) -> Option<PathBuf> {
    cover_path_in(&drafts_dir(), file_name, id)
}

/// The unsaved edits for a recording, if any.
pub fn load_draft(file_name: &str) -> Option<EditList> {
    load_draft_in(&drafts_dir(), file_name)
}

/// Keeps unsaved edits; empty edits remove `edits.json` (and the folder,
/// once nothing else is in it).
pub fn save_draft(file_name: &str, edits: &EditList) -> Result<(), String> {
    save_draft_in(&drafts_dir(), file_name, edits)
}

/// Forgets everything the editor kept for a recording.
pub fn discard_draft(file_name: &str) {
    discard_draft_in(&drafts_dir(), file_name);
}

/// Keeps a draft with its recording when the recording is renamed.
pub fn rename_draft(old: &str, new: &str) {
    rename_draft_in(&drafts_dir(), old, new);
}

/// Removes the drafts of recordings that are gone: those whose file name
/// isn't in `existing` and that haven't changed for `grace`
/// (`ORPHAN_GRACE`). Returns how many were removed.
pub fn sweep_orphans(existing: &HashSet<String>, grace: Duration) -> usize {
    sweep_orphans_in(&drafts_dir(), existing, grace)
}

fn store_cover_in(dir: &Path, file_name: &str, mime: &str, data: &[u8]) -> Result<String, String> {
    let covers = folder_in(dir, file_name).join(COVERS_DIR);
    std::fs::create_dir_all(&covers).map_err(|e| format!("creating {}: {e}", covers.display()))?;
    let id = format!(
        "{:016x}.{}",
        crate::library::fnv1a(data),
        crate::tags::cover_extension(mime)
    );
    let path = covers.join(&id);
    if !path.exists() {
        std::fs::write(&path, data).map_err(|e| format!("writing {}: {e}", path.display()))?;
    }
    Ok(id)
}

fn cover_path_in(dir: &Path, file_name: &str, id: &str) -> Option<PathBuf> {
    if id.is_empty() || id.contains(['/', '\\']) || id.starts_with('.') {
        return None;
    }
    let path = folder_in(dir, file_name).join(COVERS_DIR).join(id);
    path.is_file().then_some(path)
}

/// Moves an old single-file draft into the recording's folder (unless the
/// folder already has a newer edit list, which wins).
fn migrate_in(dir: &Path, file_name: &str) {
    let old = old_draft_path(dir, file_name);
    if !old.is_file() {
        return;
    }
    let folder = folder_in(dir, file_name);
    let new = folder.join(EDITS_FILE);
    if new.exists() {
        let _ = std::fs::remove_file(old);
    } else if std::fs::create_dir_all(&folder).is_ok() {
        let _ = std::fs::rename(old, new);
    }
}

fn load_draft_in(dir: &Path, file_name: &str) -> Option<EditList> {
    migrate_in(dir, file_name);
    let text = std::fs::read_to_string(folder_in(dir, file_name).join(EDITS_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_draft_in(dir: &Path, file_name: &str, edits: &EditList) -> Result<(), String> {
    let folder = folder_in(dir, file_name);
    let path = folder.join(EDITS_FILE);
    // These edits replace an old-style draft, if there is one.
    let _ = std::fs::remove_file(old_draft_path(dir, file_name));
    if edits.is_empty() {
        let _ = std::fs::remove_file(path);
        // Markers and covers may still matter; remove the folder only when
        // nothing (but an empty covers folder) is left. remove_dir fails on
        // a folder that isn't empty.
        let _ = std::fs::remove_dir(folder.join(COVERS_DIR));
        let _ = std::fs::remove_dir(&folder);
        return Ok(());
    }
    std::fs::create_dir_all(&folder).map_err(|e| format!("creating {}: {e}", folder.display()))?;
    let json = serde_json::to_string(edits).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(|e| format!("writing {}: {e}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("writing {}: {e}", path.display()))
}

fn discard_draft_in(dir: &Path, file_name: &str) {
    let _ = std::fs::remove_dir_all(folder_in(dir, file_name));
    let _ = std::fs::remove_file(old_draft_path(dir, file_name));
}

fn rename_draft_in(dir: &Path, old: &str, new: &str) {
    if paths::sanitize(old) == paths::sanitize(new) {
        return;
    }
    migrate_in(dir, old);
    let from = folder_in(dir, old);
    if !from.is_dir() {
        return;
    }
    // Whatever is kept under the new name belonged to an earlier recording
    // that is gone (the new name was free in the recordings folder).
    let to = folder_in(dir, new);
    discard_draft_in(dir, new);
    let _ = std::fs::rename(from, to);
}

fn sweep_orphans_in(dir: &Path, existing: &HashSet<String>, grace: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let existing: HashSet<String> = existing.iter().map(|n| paths::sanitize(n)).collect();
    let now = SystemTime::now();
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let key = if kind.is_dir() {
            name.as_str()
        } else if let Some(stem) = name.strip_suffix(".json")
            && kind.is_file()
        {
            stem
        } else {
            continue;
        };
        if existing.contains(key) {
            continue;
        }
        let Some(newest) = newest_mtime(&path) else {
            continue;
        };
        if now.duration_since(newest).is_ok_and(|age| age > grace) {
            let gone = if kind.is_dir() {
                std::fs::remove_dir_all(&path)
            } else {
                std::fs::remove_file(&path)
            };
            if gone.is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

/// When `path` last changed: a file's modification time, or the latest of
/// the files in a folder (an empty folder's own time). None when anything
/// in it can't be read, so it's kept.
fn newest_mtime(path: &Path) -> Option<SystemTime> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    if !meta.is_dir() {
        return meta.modified().ok();
    }
    let mut newest = None;
    for entry in std::fs::read_dir(path).ok()? {
        let time = newest_mtime(&entry.ok()?.path())?;
        newest = Some(newest.map_or(time, |n: SystemTime| n.max(time)));
    }
    newest.or_else(|| meta.modified().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1000; // 1 frame = 1 ms

    fn splice(at: f64, name: &str) -> Splice {
        Splice {
            at_ms: at,
            name: name.into(),
            tags: None,
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
        };
        save_draft_in(&dir, "a.mp3", &e).unwrap();
        assert_eq!(load_draft_in(&dir, "a.mp3"), Some(e));
        save_draft_in(&dir, "a.mp3", &EditList::default()).unwrap();
        assert_eq!(load_draft_in(&dir, "a.mp3"), None);
        assert!(!dir.join("a.mp3").exists(), "the empty folder is removed");
    }

    fn tags(artist: &str) -> TrackTags {
        TrackTags {
            artist: Some(artist.into()),
            ..Default::default()
        }
    }

    #[test]
    fn tag_edits_alone_are_not_empty() {
        let mut e = EditList::default();
        assert!(e.is_empty());
        e.first_tags = Some(TrackTags::default());
        assert!(e.is_empty(), "no overrides is no change");
        e.first_tags = Some(tags(""));
        assert!(!e.is_empty(), "clearing a tag is a change");
    }

    #[test]
    fn plans_carry_each_tracks_tags() {
        let e = EditList {
            first_name: "A".into(),
            first_tags: Some(tags("First")),
            splices: vec![
                Splice {
                    tags: Some(tags("Third")),
                    ..splice(6000.0, "C")
                },
                splice(3000.0, "B"),
                // Two at one point: the later one names and tags the track.
                Splice {
                    tags: Some(tags("Later")),
                    ..splice(6000.0, "C2")
                },
            ],
            ..Default::default()
        };
        let t = e.plan(RATE, 10_000);
        assert_eq!(
            t.iter()
                .map(|t| (t.name.as_str(), t.tags.artist.as_deref()))
                .collect::<Vec<_>>(),
            vec![("A", Some("First")), ("B", None), ("C2", Some("Later"))]
        );
    }

    #[test]
    fn added_splices_inherit_the_split_tracks_tags() {
        let mut e = EditList {
            first_name: "A".into(),
            first_tags: Some(TrackTags {
                cover: Some("c.jpg".into()),
                track: Some(4),
                ..tags("First")
            }),
            splices: vec![Splice {
                tags: Some(tags("Second")),
                ..splice(5000.0, "B")
            }],
            ..Default::default()
        };
        e.add_splice(2000.0, "A2");
        e.add_splice(7000.0, "B2");
        e.add_splice(5000.0, "B3");
        let by_name = |n: &str| e.splices.iter().find(|s| s.name == n).unwrap().clone();
        assert_eq!(by_name("A2").tags, e.first_tags);
        assert_eq!(by_name("A2").at_ms, 2000.0);
        assert_eq!(by_name("B2").tags, Some(tags("Second")));
        assert_eq!(by_name("B3").tags, Some(tags("Second")));

        let mut bare = EditList::default();
        bare.add_splice(1000.0, "X");
        assert_eq!(bare.splices, vec![splice(1000.0, "X")]);
    }

    #[test]
    fn old_single_file_drafts_move_into_the_folder() {
        let dir = paths::tempdir();
        let e = EditList {
            first_name: "x".into(),
            splices: vec![splice(1.5, "y")],
            ..Default::default()
        };
        std::fs::write(dir.join("a_b.mp3.json"), serde_json::to_string(&e).unwrap()).unwrap();
        assert_eq!(load_draft_in(&dir, "a/b.mp3"), Some(e.clone()));
        assert!(!dir.join("a_b.mp3.json").exists());
        assert!(dir.join("a_b.mp3").join(EDITS_FILE).is_file());
        assert_eq!(load_draft_in(&dir, "a/b.mp3"), Some(e));
    }

    #[test]
    fn emptying_a_draft_keeps_the_folder_while_it_holds_anything() {
        let dir = paths::tempdir();
        let e = EditList {
            first_tags: Some(tags("A")),
            ..Default::default()
        };
        save_draft_in(&dir, "a.mp3", &e).unwrap();
        store_cover_in(&dir, "a.mp3", "image/png", b"png").unwrap();
        std::fs::write(dir.join("a.mp3").join("markers.json"), b"[]").unwrap();
        save_draft_in(&dir, "a.mp3", &EditList::default()).unwrap();
        assert!(!dir.join("a.mp3").join(EDITS_FILE).exists());
        assert!(dir.join("a.mp3").join("markers.json").exists());
        assert!(dir.join("a.mp3").join(COVERS_DIR).is_dir());
    }

    #[test]
    fn discard_and_rename_move_the_whole_folder() {
        let dir = paths::tempdir();
        let e = EditList {
            splices: vec![splice(1.0, "y")],
            ..Default::default()
        };
        save_draft_in(&dir, "a.mp3", &e).unwrap();
        let id = store_cover_in(&dir, "a.mp3", "image/jpeg", b"jpeg").unwrap();
        assert!(id.ends_with(".jpg"));
        assert!(cover_path_in(&dir, "a.mp3", &id).is_some());
        assert!(cover_path_in(&dir, "a.mp3", "../edits.json").is_none());

        // A stale folder under the new name is replaced.
        std::fs::create_dir_all(dir.join("b.mp3")).unwrap();
        std::fs::write(dir.join("b.mp3").join("stale"), b"").unwrap();
        rename_draft_in(&dir, "a.mp3", "b.mp3");
        assert!(!dir.join("a.mp3").exists());
        assert!(!dir.join("b.mp3").join("stale").exists());
        assert_eq!(load_draft_in(&dir, "b.mp3"), Some(e.clone()));
        assert!(cover_path_in(&dir, "b.mp3", &id).is_some());

        // Old-style drafts follow too.
        std::fs::write(dir.join("c.mp3.json"), serde_json::to_string(&e).unwrap()).unwrap();
        rename_draft_in(&dir, "c.mp3", "d.mp3");
        assert!(!dir.join("c.mp3.json").exists());
        assert_eq!(load_draft_in(&dir, "d.mp3"), Some(e.clone()));

        std::fs::write(dir.join("b.mp3.json"), b"{}").unwrap();
        discard_draft_in(&dir, "b.mp3");
        assert!(!dir.join("b.mp3").exists() && !dir.join("b.mp3.json").exists());
        assert_eq!(load_draft_in(&dir, "b.mp3"), None);
    }

    #[test]
    fn sweep_removes_only_old_drafts_of_missing_recordings() {
        let dir = paths::tempdir();
        let e = EditList {
            splices: vec![splice(1.0, "y")],
            ..Default::default()
        };
        let age = |path: &Path, days: u64| {
            let when = SystemTime::now() - Duration::from_secs(days * 86_400);
            std::fs::File::options()
                .write(true)
                .open(path)
                .unwrap()
                .set_modified(when)
                .unwrap();
        };
        for name in ["kept: live.mp3", "old.mp3", "recent.mp3", "touched.mp3"] {
            save_draft_in(&dir, name, &e).unwrap();
            age(&folder_in(&dir, name).join(EDITS_FILE), 40);
        }
        // Something in it changed lately.
        std::fs::write(dir.join("touched.mp3").join("markers.json"), b"[]").unwrap();
        age(&dir.join("recent.mp3").join(EDITS_FILE), 5);
        std::fs::write(dir.join("gone.mp3.json"), b"{}").unwrap();
        age(&dir.join("gone.mp3.json"), 40);
        std::fs::write(dir.join("unrelated.txt"), b"").unwrap();
        age(&dir.join("unrelated.txt"), 40);

        let existing = HashSet::from(["kept: live.mp3".to_string()]);
        assert_eq!(sweep_orphans_in(&dir, &existing, ORPHAN_GRACE), 2);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec![
                "kept_ live.mp3",
                "recent.mp3",
                "touched.mp3",
                "unrelated.txt"
            ]
        );
        assert_eq!(
            sweep_orphans_in(&dir.join("missing"), &existing, ORPHAN_GRACE),
            0
        );
    }
}

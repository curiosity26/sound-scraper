//! JSON payloads of the C ABI ([`crate::ffi`]) that have no home elsewhere.
//! With the `ts` feature, these and the other bridge types (settings,
//! playlists, burning, the track editor, skins) export TypeScript bindings
//! to `app/src/native/bridge` (see `app/scripts/gen-bridge-types.js`).

use serde::Serialize;

/// The answer envelope of `ss_playlists` and `ss_burn`: `{"ok": answer}` or
/// `{"error": message}`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Reply<T> {
    Ok { ok: T },
    Error { error: String },
}

impl<T> From<Result<T, String>> for Reply<T> {
    fn from(result: Result<T, String>) -> Self {
        match result {
            Ok(ok) => Self::Ok { ok },
            Err(error) => Self::Error { error },
        }
    }
}

/// The track editor's waveform (`ss_editor_status`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum WaveformStatus {
    /// Still building, 0..1.
    Loading {
        progress: f32,
    },
    Ready {
        /// Sample rate.
        rate: u32,
        duration_ms: f64,
        /// The MP3 frame grid lossless cuts land on, when known.
        frame_ms: Option<f64>,
        frame_offset_ms: Option<f64>,
        /// A lossless master exists: tracks are encoded from it on save.
        master: bool,
    },
    Failed {
        message: String,
    },
}

/// A track an edit list makes (`ss_editor_tracks`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct EditorTrack {
    pub name: String,
    /// Where the track starts in the original (its splice, or 0).
    pub start_ms: f64,
    /// What's left of it.
    pub duration_ms: f64,
    /// Has a deleted stretch inside it, so it's re-encoded on save.
    pub reencode: bool,
}

/// What `ss_editor_save` wrote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SavedTracks {
    /// The new files' names, in track order.
    pub files: Vec<String>,
    /// How many were re-encoded from the MP3 rather than cut losslessly.
    pub reencoded: usize,
    /// Every track was encoded once from the lossless master.
    pub from_master: bool,
}

/// The lossless masters kept (`ss_masters_usage`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct MastersUsage {
    pub count: usize,
    pub bytes: u64,
}

/// JSON text for a payload, with its object keys sorted, as the
/// `serde_json::json!` values these types replaced were written.
pub fn to_sorted_json<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_value(value)
        .map(|v| v.to_string())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// Each payload, written as `ss_*` writes it (`to_sorted_json`), is byte
    /// for byte the `serde_json::json!` output it replaced. (Serialized
    /// directly, keys would follow declaration order and an f32 would be
    /// written at f32 precision: that's why the `ss_*` calls go through a
    /// Value.)
    fn same(new: impl Serialize, old: Value) {
        assert_eq!(to_sorted_json(&new).unwrap(), old.to_string());
    }

    #[test]
    fn payloads_keep_their_json() {
        let p: f32 = 0.37;
        same(
            WaveformStatus::Loading { progress: p },
            json!({ "state": "loading", "progress": p }),
        );
        let (rate, frames, master) = (44_100u32, 1_234_567u64, true);
        for grid in [Some((26.122448979591837, 3.5)), None] {
            same(
                WaveformStatus::Ready {
                    rate,
                    duration_ms: frames as f64 * 1000.0 / f64::from(rate),
                    frame_ms: grid.map(|g| g.0),
                    frame_offset_ms: grid.map(|g| g.1),
                    master,
                },
                json!({
                    "state": "ready",
                    "rate": rate,
                    "durationMs": frames as f64 * 1000.0 / f64::from(rate),
                    "frameMs": grid.map(|g| g.0),
                    "frameOffsetMs": grid.map(|g| g.1),
                    "master": master,
                }),
            );
        }
        let message = "can't decode \"x.mp3\"".to_string();
        same(
            WaveformStatus::Failed {
                message: message.clone(),
            },
            json!({ "state": "failed", "message": message }),
        );
        same(
            vec![EditorTrack {
                name: "Second".into(),
                start_ms: 1000.0,
                duration_ms: 2500.5,
                reencode: true,
            }],
            json!([{
                "name": "Second",
                "startMs": 1000.0,
                "durationMs": 2500.5,
                "reencode": true,
            }]),
        );
        let files = vec!["Album.mp3".to_string(), "Second.mp3".to_string()];
        same(
            SavedTracks {
                files: files.clone(),
                reencoded: 1usize,
                from_master: false,
            },
            json!({ "files": files, "reencoded": 1usize, "fromMaster": false }),
        );
        let (count, bytes) = (3usize, 5_000_000_000u64);
        same(
            MastersUsage { count, bytes },
            json!({ "count": count, "bytes": bytes }),
        );
        let ok: Result<Vec<u32>, String> = Ok(vec![1, 2]);
        same(Reply::from(ok), json!({ "ok": [1, 2] }));
        let error: Result<Vec<u32>, String> = Err("no such playlist".into());
        same(Reply::from(error), json!({ "error": "no such playlist" }));
        same(Reply::Ok { ok: Value::Null }, json!({ "ok": null }));
    }

    #[test]
    fn stored_settings_keep_their_json() {
        let mut s = crate::settings::Settings {
            recordings_dir: Some("/tmp/Recordings".into()),
            skin: Some("com.example.skin".into()),
            ..Default::default()
        };
        s.last_source = Some(crate::settings::SourceRef::App {
            id: None,
            name: "Music".into(),
        });
        // What ss_settings_get wrote before.
        let mut old = serde_json::to_value(&s).unwrap();
        old["effectiveRecordingsDir"] =
            Value::String(s.recordings_dir().to_string_lossy().into_owned());
        same(crate::settings::StoredSettings::from(s), old);
    }
}

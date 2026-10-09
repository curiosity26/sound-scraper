//! User settings, persisted as JSON in the app data folder
//! (docs/design.md §4, §5, §2 "saved as a default").

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{paths, tags::TagVersion};

/// MP3 encoding quality (docs/design.md §4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    Cbr128,
    #[default]
    Cbr192,
    Cbr256,
    Cbr320,
    /// LAME VBR -V0 (~245 kbps).
    Vbr0,
    /// LAME VBR -V2 (~190 kbps).
    Vbr2,
}

/// A remembered capture source, matched by bundle ID / executable path
/// rather than PID so it survives app restarts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SourceRef {
    System,
    App {
        /// Bundle ID (macOS) or executable path (Windows), when known.
        id: Option<String>,
        name: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Format version of the saved file (see `load_from`).
    pub version: u32,
    /// `None` = the default `~/Music/Sound Scraper`.
    pub recordings_dir: Option<PathBuf>,
    pub quality: Quality,
    /// "2.4" or "2.3".
    pub id3_version: String,
    pub last_source: Option<SourceRef>,
    /// Skin id, or an absolute path to an unpacked skin folder (for skin
    /// authors). `None` = the Default skin.
    pub skin: Option<String>,
    /// Draw the skinned main panel at twice its size.
    pub double_size: bool,
    /// Drop silence before the first and after the last sound of a recording.
    pub trim_silence: bool,
    /// Record a lossless master for the track editor (masters.rs).
    pub keep_masters: bool,
    /// Recordings shorter than this (minutes) drop their master.
    pub master_min_minutes: u32,
    /// Masters together stay under this many GB.
    pub master_budget_gb: u32,
    /// Masters not edited for this many days are removed.
    pub master_max_age_days: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            recordings_dir: None,
            quality: Quality::default(),
            id3_version: default_id3_version().into(),
            last_source: None,
            skin: None,
            double_size: false,
            trim_silence: true,
            keep_masters: true,
            master_min_minutes: 20,
            master_budget_gb: 10,
            master_max_age_days: 30,
        }
    }
}

/// Version 1 made ID3v2.3 the Windows default.
const CURRENT_VERSION: u32 = 1;

/// ID3v2.4 everywhere except Windows, whose MP3 metadata reader (Explorer
/// thumbnails, Media Player) can't read v2.4's UTF-8 frames, cover art included.
pub fn default_id3_version() -> &'static str {
    if cfg!(target_os = "windows") {
        "2.3"
    } else {
        "2.4"
    }
}

impl Settings {
    pub fn recordings_dir(&self) -> PathBuf {
        self.recordings_dir
            .clone()
            .unwrap_or_else(paths::recordings_dir)
    }

    pub fn master_policy(&self) -> crate::masters::Policy {
        use std::time::Duration;
        crate::masters::Policy {
            keep: self.keep_masters,
            min_length: Duration::from_secs(u64::from(self.master_min_minutes) * 60),
            budget_bytes: u64::from(self.master_budget_gb) * 1024 * 1024 * 1024,
            max_age: Duration::from_secs(u64::from(self.master_max_age_days) * 86_400),
        }
    }

    pub fn tag_version(&self) -> TagVersion {
        if self.id3_version == "2.3" {
            TagVersion::V23
        } else {
            TagVersion::V24
        }
    }

    /// Checks values coming from the UI.
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.id3_version.as_str(), "2.3" | "2.4") {
            return Err(format!("unknown ID3 version {}", self.id3_version));
        }
        if let Some(dir) = &self.recordings_dir {
            if !dir.is_absolute() {
                return Err(format!(
                    "the recordings folder must be an absolute path: {}",
                    dir.display()
                ));
            }
            std::fs::create_dir_all(dir).map_err(|e| {
                format!("can't use {} as the recordings folder: {e}", dir.display())
            })?;
        }
        Ok(())
    }
}

pub fn settings_path() -> PathBuf {
    paths::app_data_dir().join("settings.json")
}

/// Loads settings; a missing or unreadable file gives the defaults.
pub fn load_from(path: &Path) -> Settings {
    let Some(mut settings) = std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
    else {
        return Settings::default();
    };
    if !std::fs::read_to_string(path).is_ok_and(|s| s.contains("\"version\"")) {
        settings.version = 0; // written before versioning
    }
    migrate(&mut settings);
    settings
}

/// Brings settings from older app versions up to date.
fn migrate(settings: &mut Settings) {
    if settings.version < 1 && cfg!(target_os = "windows") && settings.id3_version == "2.4" {
        // Saved when v2.4 was the default everywhere; Windows can't show v2.4 cover art.
        settings.id3_version = "2.3".into();
    }
    settings.version = CURRENT_VERSION;
}

pub fn load() -> Settings {
    load_from(&settings_path())
}

/// Validates and saves atomically (temp file + rename).
pub fn save_to(path: &Path, settings: &Settings) -> Result<(), String> {
    settings.validate()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(|e| format!("writing {}: {e}", temp.display()))?;
    std::fs::rename(&temp, path).map_err(|e| format!("saving {}: {e}", path.display()))
}

pub fn save(settings: &Settings) -> Result<(), String> {
    save_to(&settings_path(), settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_round_trip() {
        let dir = paths::tempdir();
        let path = dir.join("settings.json");
        assert_eq!(load_from(&path), Settings::default());
        let s = Settings {
            version: CURRENT_VERSION,
            recordings_dir: Some(dir.join("Recordings")),
            quality: Quality::Vbr0,
            id3_version: "2.3".into(),
            last_source: Some(SourceRef::App {
                id: Some("com.spotify.client".into()),
                name: "Spotify".into(),
            }),
            skin: Some("com.example.green".into()),
            double_size: true,
            trim_silence: false,
            keep_masters: false,
            master_min_minutes: 5,
            master_budget_gb: 2,
            master_max_age_days: 7,
        };
        save_to(&path, &s).unwrap();
        assert_eq!(load_from(&path), s);
        assert!(dir.join("Recordings").is_dir(), "folder is created");
        assert_eq!(s.tag_version(), TagVersion::V23);
        let json = std::fs::read_to_string(&path).unwrap();
        assert!(
            json.contains("\"quality\": \"vbr0\"") && json.contains("\"kind\": \"app\""),
            "{json}"
        );
    }

    #[test]
    fn migrates_pre_versioning_files() {
        let dir = paths::tempdir();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"quality":"cbr192","id3Version":"2.4"}"#).unwrap();
        let s = load_from(&path);
        assert_eq!(s.version, CURRENT_VERSION);
        assert_eq!(
            s.id3_version,
            if cfg!(target_os = "windows") {
                "2.3"
            } else {
                "2.4"
            }
        );
        // An explicit choice saved by a current version is kept.
        std::fs::write(&path, r#"{"version":1,"id3Version":"2.4"}"#).unwrap();
        assert_eq!(load_from(&path).id3_version, "2.4");
    }

    #[test]
    fn tolerates_partial_or_bad_files_and_rejects_bad_values() {
        let dir = paths::tempdir();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"quality":"cbr320"}"#).unwrap();
        assert_eq!(load_from(&path).quality, Quality::Cbr320);
        assert!(
            load_from(&path).trim_silence,
            "trimming is on unless turned off"
        );
        assert_eq!(load_from(&path).id3_version, default_id3_version());
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(load_from(&path), Settings::default());
        let bad = Settings {
            id3_version: "1.0".into(),
            ..Default::default()
        };
        assert!(save_to(&path, &bad).is_err());
        let relative = Settings {
            recordings_dir: Some("relative/dir".into()),
            ..Default::default()
        };
        assert!(save_to(&path, &relative).is_err());
    }
}

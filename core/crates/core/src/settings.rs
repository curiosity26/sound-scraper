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
    /// `None` = the default `~/Music/Sound Scraper`.
    pub recordings_dir: Option<PathBuf>,
    pub quality: Quality,
    /// "2.4" or "2.3".
    pub id3_version: String,
    pub last_source: Option<SourceRef>,
}

impl Default for Settings {
    fn default() -> Self {
        Self { recordings_dir: None, quality: Quality::default(), id3_version: "2.4".into(), last_source: None }
    }
}

impl Settings {
    pub fn recordings_dir(&self) -> PathBuf {
        self.recordings_dir.clone().unwrap_or_else(paths::recordings_dir)
    }

    pub fn tag_version(&self) -> TagVersion {
        if self.id3_version == "2.3" { TagVersion::V23 } else { TagVersion::V24 }
    }

    /// Checks values coming from the UI.
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.id3_version.as_str(), "2.3" | "2.4") {
            return Err(format!("unknown ID3 version {}", self.id3_version));
        }
        if let Some(dir) = &self.recordings_dir {
            if !dir.is_absolute() {
                return Err(format!("the recordings folder must be an absolute path: {}", dir.display()));
            }
            std::fs::create_dir_all(dir).map_err(|e| format!("can't use {} as the recordings folder: {e}", dir.display()))?;
        }
        Ok(())
    }
}

pub fn settings_path() -> PathBuf {
    paths::app_data_dir().join("settings.json")
}

/// Loads settings; a missing or unreadable file gives the defaults.
pub fn load_from(path: &Path) -> Settings {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
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
            recordings_dir: Some(dir.join("Recordings")),
            quality: Quality::Vbr0,
            id3_version: "2.3".into(),
            last_source: Some(SourceRef::App { id: Some("com.spotify.client".into()), name: "Spotify".into() }),
        };
        save_to(&path, &s).unwrap();
        assert_eq!(load_from(&path), s);
        assert!(dir.join("Recordings").is_dir(), "folder is created");
        assert_eq!(s.tag_version(), TagVersion::V23);
        let json = std::fs::read_to_string(&path).unwrap();
        assert!(json.contains("\"quality\": \"vbr0\"") && json.contains("\"kind\": \"app\""), "{json}");
    }

    #[test]
    fn tolerates_partial_or_bad_files_and_rejects_bad_values() {
        let dir = paths::tempdir();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"quality":"cbr320"}"#).unwrap();
        assert_eq!(load_from(&path).quality, Quality::Cbr320);
        assert_eq!(load_from(&path).id3_version, "2.4");
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(load_from(&path), Settings::default());
        let bad = Settings { id3_version: "1.0".into(), ..Default::default() };
        assert!(save_to(&path, &bad).is_err());
        let relative = Settings { recordings_dir: Some("relative/dir".into()), ..Default::default() };
        assert!(save_to(&path, &relative).is_err());
    }
}

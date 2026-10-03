//! Sound Scraper skins.
//!
//! A skin is a folder (or a `.sskin` zip of one) with a `skin.json` manifest
//! and its images. This crate validates skins, installs them into the user's
//! Skins folder and resolves them into the JSON the UI draws from, falling
//! back to the built-in Default skin for anything a skin leaves out.

pub mod files;
pub mod manifest;
pub mod resolve;

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

pub use resolve::{ImageRef, ResolvedSkin};

/// Id of the Default skin, which is compiled into the app.
pub const DEFAULT_ID: &str = "com.alexboyce.soundscraper.default";

mod builtin {
    include!(concat!(env!("OUT_DIR"), "/builtin_default.rs"));
}

/// A skin in the list for the skin chooser.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinSummary {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub dir: PathBuf,
    pub builtin: bool,
    /// Set when the installed copy no longer loads.
    pub error: Option<String>,
}

/// Installed skins live in `skins_dir/<id>/`; the Default skin is extracted
/// to `skins_dir/.builtin-<hash>/`.
pub struct SkinStore {
    skins_dir: PathBuf,
}

impl SkinStore {
    pub fn new(skins_dir: impl Into<PathBuf>) -> Self {
        Self { skins_dir: skins_dir.into() }
    }

    pub fn skins_dir(&self) -> &Path {
        &self.skins_dir
    }

    /// The Default skin's folder, extracting it from the binary if needed.
    pub fn builtin_dir(&self) -> Result<PathBuf, String> {
        let dir = self.skins_dir.join(format!(".builtin-{}", builtin::HASH));
        if dir.join("skin.json").is_file() {
            return Ok(dir);
        }
        fs::create_dir_all(&self.skins_dir).map_err(|e| format!("{}: {e}", self.skins_dir.display()))?;
        let temp = self.skins_dir.join(format!(".builtin-{}.tmp-{}", builtin::HASH, std::process::id()));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).map_err(|e| format!("{}: {e}", temp.display()))?;
        for (name, bytes) in builtin::FILES {
            fs::write(temp.join(name), bytes).map_err(|e| format!("{name}: {e}"))?;
        }
        if fs::rename(&temp, &dir).is_err() {
            // Another process got there first.
            let _ = fs::remove_dir_all(&temp);
        }
        // Remove copies left by older builds.
        if let Ok(entries) = fs::read_dir(&self.skins_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with(".builtin-") && entry.path() != dir && !name.contains(".tmp-") {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
        Ok(dir)
    }

    /// The Default skin, resolved.
    pub fn load_default(&self) -> Result<ResolvedSkin, String> {
        let mut skin = resolve::load_dir(&self.builtin_dir()?, None).map_err(|e| format!("Default skin: {e}"))?;
        skin.builtin = true;
        Ok(skin)
    }

    /// Loads an installed skin by id (the Default skin for its id).
    pub fn load(&self, id: &str) -> Result<ResolvedSkin, String> {
        if id == DEFAULT_ID {
            return self.load_default();
        }
        resolve::check_id(id).map_err(|_| format!("\"{id}\" is not a skin id"))?;
        let dir = self.skins_dir.join(id);
        if !dir.is_dir() {
            return Err(format!("the skin \"{id}\" is not installed"));
        }
        self.load_dir(&dir)
    }

    /// Loads an unpacked skin folder in place (for skin authors).
    pub fn load_dir(&self, dir: &Path) -> Result<ResolvedSkin, String> {
        let base = self.load_default()?;
        resolve::load_dir(dir, Some(&base))
    }

    /// Validates a `.sskin` archive and installs it as `skins_dir/<id>`,
    /// replacing an installed skin with the same id.
    pub fn install(&self, archive: &Path) -> Result<SkinSummary, String> {
        fs::create_dir_all(&self.skins_dir).map_err(|e| format!("{}: {e}", self.skins_dir.display()))?;
        let staging = self.skins_dir.join(format!(".installing-{}", std::process::id()));
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging).map_err(|e| format!("{}: {e}", staging.display()))?;
        let result = (|| {
            let root = files::extract_archive(archive, &staging)?;
            let skin = self.load_dir(&root)?;
            if skin.id == DEFAULT_ID {
                return Err("the Default skin is built in and can't be replaced".to_string());
            }
            let target = self.skins_dir.join(&skin.id);
            let old = self.skins_dir.join(format!(".removing-{}", skin.id));
            let _ = fs::remove_dir_all(&old);
            if target.exists() {
                fs::rename(&target, &old).map_err(|e| format!("replacing {}: {e}", target.display()))?;
            }
            fs::rename(&root, &target).map_err(|e| format!("installing to {}: {e}", target.display()))?;
            let _ = fs::remove_dir_all(&old);
            Ok(summary(&skin, target, None))
        })();
        let _ = fs::remove_dir_all(&staging);
        result
    }

    /// The Default skin, then installed skins by name. Skins that no longer
    /// load are listed with an `error`.
    pub fn list(&self) -> Vec<SkinSummary> {
        let mut skins = Vec::new();
        match self.load_default() {
            Ok(skin) => skins.push(summary(&skin, skin.dir.clone(), None)),
            Err(e) => skins.push(SkinSummary {
                id: DEFAULT_ID.into(),
                name: "Default".into(),
                author: None,
                version: None,
                dir: PathBuf::new(),
                builtin: true,
                error: Some(e),
            }),
        }
        let mut installed = Vec::new();
        for entry in fs::read_dir(&self.skins_dir).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !entry.path().is_dir() || resolve::check_id(&name).is_err() {
                continue;
            }
            let mut warnings = Vec::new();
            installed.push(match resolve::read_manifest(&entry.path(), &mut warnings) {
                Ok(m) if m.id == name => SkinSummary {
                    id: m.id,
                    name: m.name,
                    author: m.author,
                    version: m.version,
                    dir: entry.path(),
                    builtin: false,
                    error: None,
                },
                Ok(m) => SkinSummary {
                    name: m.name,
                    error: Some(format!("installed as {name} but its id is {}", m.id)),
                    ..unreadable(&name, entry.path())
                },
                Err(e) => SkinSummary { error: Some(e), ..unreadable(&name, entry.path()) },
            });
        }
        installed.sort_by_key(|s| s.name.to_lowercase());
        skins.extend(installed);
        skins
    }

    /// Uninstalls a skin. The Default skin can't be removed.
    pub fn remove(&self, id: &str) -> Result<(), String> {
        if id == DEFAULT_ID {
            return Err("the Default skin is built in and can't be removed".into());
        }
        resolve::check_id(id).map_err(|_| format!("\"{id}\" is not a skin id"))?;
        let dir = self.skins_dir.join(id);
        if !dir.is_dir() {
            return Err(format!("the skin \"{id}\" is not installed"));
        }
        fs::remove_dir_all(&dir).map_err(|e| format!("removing {}: {e}", dir.display()))
    }
}

fn summary(skin: &ResolvedSkin, dir: PathBuf, error: Option<String>) -> SkinSummary {
    SkinSummary {
        id: skin.id.clone(),
        name: skin.name.clone(),
        author: skin.author.clone(),
        version: skin.version.clone(),
        dir,
        builtin: skin.builtin,
        error,
    }
}

fn unreadable(id: &str, dir: PathBuf) -> SkinSummary {
    SkinSummary { id: id.into(), name: id.into(), author: None, version: None, dir, builtin: false, error: None }
}

#[cfg(test)]
mod tests;

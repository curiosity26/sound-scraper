//! Sound Scraper skins.
//!
//! A skin is a folder (or a `.sskin` zip of one) with a `skin.json` manifest
//! and its images. This crate validates skins, installs them into the user's
//! Skins folder and resolves them into the JSON the UI draws from, falling
//! back to the built-in Default skin for anything a skin leaves out.

pub mod files;
pub mod manifest;
pub mod preview;
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

/// A `.sskin` looked at before installing it (the install card).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinInspection {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    /// The archive.
    pub path: PathBuf,
    /// The main panel with sample content (PNG, 2x).
    pub preview: Option<PathBuf>,
    pub warnings: Vec<String>,
    /// The installed skin with the same id, which installing replaces.
    pub installed: Option<SkinSummary>,
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

    /// Validates a `.sskin` archive without installing it: what it is, a
    /// preview, and the installed skin it would replace.
    pub fn inspect(&self, archive: &Path) -> Result<SkinInspection, String> {
        fs::create_dir_all(&self.skins_dir).map_err(|e| format!("{}: {e}", self.skins_dir.display()))?;
        let staging = self.skins_dir.join(format!(".inspecting-{}-{}", std::process::id(), unique()));
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging).map_err(|e| format!("{}: {e}", staging.display()))?;
        let result = (|| {
            let root = files::extract_archive(archive, &staging)?;
            let skin = self.load_dir(&root)?;
            if skin.id == DEFAULT_ID {
                return Err("the Default skin is built in and can't be replaced".to_string());
            }
            // One archive preview at a time.
            for entry in fs::read_dir(self.previews_dir()).into_iter().flatten().flatten() {
                if entry.file_name().to_string_lossy().starts_with("archive-") {
                    let _ = fs::remove_file(entry.path());
                }
            }
            let preview = self.previews_dir().join(format!("archive-{}-{}.png", std::process::id(), unique()));
            let preview = preview::write_main_png(&skin, &preview).ok().map(|()| preview);
            let installed = self.list().into_iter().find(|s| s.id == skin.id && !s.builtin);
            Ok(SkinInspection {
                id: skin.id,
                name: skin.name,
                author: skin.author,
                version: skin.version,
                description: skin.description,
                path: archive.to_path_buf(),
                preview,
                warnings: skin.warnings,
                installed,
            })
        })();
        let _ = fs::remove_dir_all(&staging);
        result
    }

    fn previews_dir(&self) -> PathBuf {
        self.skins_dir.join(".previews")
    }

    /// A picture of a loaded skin's main panel (PNG, 2x), drawn once per
    /// version of its files and cached.
    pub fn preview(&self, skin: &ResolvedSkin) -> Result<PathBuf, String> {
        let stamp = folder_stamp(&skin.dir)?;
        let key = format!("{:016x}", fnv(&format!("{}|{}|{stamp}", skin.id, skin.dir.display())));
        let prefix = format!("{}-", skin.id);
        let path = self.previews_dir().join(format!("{prefix}{key}.png"));
        if path.is_file() {
            return Ok(path);
        }
        // Drop this skin's older pictures.
        for entry in fs::read_dir(self.previews_dir()).into_iter().flatten().flatten() {
            if entry.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = fs::remove_file(entry.path());
            }
        }
        preview::write_main_png(skin, &path)?;
        Ok(path)
    }

    /// Checks an unpacked skin folder and zips it into a `.sskin` at `out`,
    /// then checks the archive installs. Returns the skin's summary (with
    /// `dir` the archive).
    pub fn package(&self, dir: &Path, out: &Path) -> Result<SkinSummary, String> {
        let skin = self.load_dir(dir)?;
        if skin.id == DEFAULT_ID {
            return Err("give the skin its own id in skin.json first (it's the Default skin's)".into());
        }
        files::write_archive(&skin.dir, out)?;
        if let Err(e) = self.inspect(out) {
            let _ = fs::remove_file(out);
            return Err(format!("the packaged skin doesn't load: {e}"));
        }
        Ok(summary(&skin, out.to_path_buf(), None))
    }

    /// Starts a new skin for an author: a copy of the Default skin in
    /// `parent/<name>` with its own id and name, and a README guide.
    pub fn create_from_template(&self, parent: &Path, name: &str) -> Result<PathBuf, String> {
        let name = name.trim();
        if name.is_empty() || name.contains(['/', '\\', ':']) || name.starts_with('.') {
            return Err(format!("\"{name}\" can't be a folder name"));
        }
        let dest = parent.join(name);
        if dest.exists() {
            return Err(format!("{} already exists", dest.display()));
        }
        let source = self.builtin_dir()?;
        fs::create_dir_all(&dest).map_err(|e| format!("{}: {e}", dest.display()))?;
        for entry in fs::read_dir(&source).map_err(|e| format!("{}: {e}", source.display()))?.flatten() {
            let file = entry.file_name();
            if file == "skin.json" || !entry.path().is_file() {
                continue;
            }
            fs::copy(entry.path(), dest.join(&file)).map_err(|e| format!("{}: {e}", file.to_string_lossy()))?;
        }
        let text = fs::read_to_string(source.join("skin.json")).map_err(|e| e.to_string())?;
        let mut manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let slug: String = name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join("-");
        let slug = if slug.is_empty() { "my-skin".to_string() } else { slug };
        manifest["$schema"] = "https://raw.githubusercontent.com/curiosity26/sound-scraper/main/skin.schema.json".into();
        manifest["id"] = format!("com.example.{slug}").into();
        manifest["name"] = name.into();
        manifest["author"] = "".into();
        manifest["version"] = "1.0".into();
        manifest["description"] = "Started from the Default skin.".into();
        let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())? + "\n";
        fs::write(dest.join("skin.json"), json).map_err(|e| format!("skin.json: {e}"))?;
        fs::write(dest.join("README.md"), GUIDE).map_err(|e| format!("README.md: {e}"))?;
        Ok(dest)
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

/// The skin authoring guide, copied into new skins as README.md.
pub const GUIDE: &str = include_str!("../../../../docs/skins.md");

/// Changes whenever a skin folder's files do (added, removed, edited): for
/// reloading a skin while its author works on it.
pub fn folder_stamp(dir: &Path) -> Result<String, String> {
    let files = files::skin_files(dir)?;
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for f in &files {
        let nanos = f.modified.and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos());
        h = fnv_more(h, &format!("{}|{}|{nanos};", f.rel, f.len));
    }
    Ok(format!("{}:{h:016x}", files.len()))
}

fn fnv(s: &str) -> u64 {
    fnv_more(0xcbf2_9ce4_8422_2325, s)
}

fn fnv_more(mut h: u64, s: &str) -> u64 {
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// A process-wide counter for temporary names.
fn unique() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    NEXT.fetch_add(1, Ordering::Relaxed)
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

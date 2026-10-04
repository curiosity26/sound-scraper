//! Skins (see the `sound_scraper_skin` crate), stored in the app data folder:
//! `~/Library/Application Support/Sound Scraper/Skins/<id>/` on macOS.

use std::path::Path;

pub use sound_scraper_skin::{DEFAULT_ID, ResolvedSkin, SkinStore, SkinSummary, folder_stamp};

use crate::{paths, settings};

/// The Skins folder: `SOUND_SCRAPER_SKINS_DIR` when the app sets it (the
/// Windows MSIX app does, so skin images have a real path its image loader
/// can open), else `Skins` in the app data folder.
pub fn store() -> SkinStore {
    match std::env::var_os("SOUND_SCRAPER_SKINS_DIR") {
        Some(dir) if !dir.is_empty() => SkinStore::new(std::path::PathBuf::from(dir)),
        _ => SkinStore::new(paths::app_data_dir().join("Skins")),
    }
}

/// Loads a skin by id, or an unpacked skin folder by absolute path; the
/// Default skin for `None`/empty.
pub fn load(store: &SkinStore, id_or_path: Option<&str>) -> Result<ResolvedSkin, String> {
    match id_or_path.filter(|s| !s.is_empty()) {
        None => store.load_default(),
        Some(p) if Path::new(p).is_absolute() => store.load_dir(Path::new(p)),
        Some(id) => store.load(id),
    }
}

/// The skin chosen in the settings, falling back to the Default skin (with
/// the reason as a warning) when it no longer loads.
pub fn load_current(store: &SkinStore) -> Result<ResolvedSkin, String> {
    let chosen = settings::load().skin;
    match load(store, chosen.as_deref()) {
        Ok(skin) => Ok(skin),
        Err(e) if chosen.is_some() => {
            let mut skin = store.load_default()?;
            skin.warnings.insert(0, format!("The chosen skin couldn't be loaded, so the Default skin is used: {e}"));
            Ok(skin)
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_by_id_path_or_default() {
        let store = SkinStore::new(paths::tempdir().join("Skins"));
        assert_eq!(load(&store, None).unwrap().id, DEFAULT_ID);
        assert_eq!(load(&store, Some("")).unwrap().id, DEFAULT_ID);
        let dir = store.builtin_dir().unwrap();
        assert_eq!(load(&store, Some(dir.to_str().unwrap())).unwrap().id, DEFAULT_ID);
        assert!(load(&store, Some("com.example.missing")).unwrap_err().contains("not installed"));
    }
}

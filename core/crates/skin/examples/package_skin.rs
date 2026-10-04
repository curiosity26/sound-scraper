//! Packages a skin folder as a `.sskin`, checking it first (what Settings ›
//! Skin › Package skin… does in the app):
//!
//!     cargo run -p sound_scraper_skin --example package_skin -- path/to/skin out.sskin

use std::path::PathBuf;

use sound_scraper_skin::SkinStore;

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(dir), Some(out)) = (args.next().map(PathBuf::from), args.next().map(PathBuf::from)) else {
        eprintln!("usage: package_skin <skin folder> <out.sskin>");
        std::process::exit(2);
    };
    let store = SkinStore::new(std::env::temp_dir().join(format!("sound-scraper-package-{}", std::process::id())));
    let result = store.package(&dir, &out);
    let _ = std::fs::remove_dir_all(store.skins_dir());
    match result {
        Ok(skin) => println!("packaged {} {} as {}", skin.name, skin.version.unwrap_or_default(), out.display()),
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}

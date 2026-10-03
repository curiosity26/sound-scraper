//! Embeds the Default skin (`skins/default` at the repo root) so the core
//! can always fall back to it, on every platform, without bundling steps.

use std::{env, fmt::Write as _, fs, path::PathBuf};

fn main() {
    let crate_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let skin_dir = crate_dir.join("../../../skins/default").canonicalize().expect("skins/default exists");
    println!("cargo:rerun-if-changed={}", skin_dir.display());

    let mut files: Vec<_> = fs::read_dir(&skin_dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_file() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .collect();
    files.sort();

    // FNV-1a over names and contents names the extracted copy, so a new
    // build never reuses files from an older Default skin.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut source = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for path in &files {
        println!("cargo:rerun-if-changed={}", path.display());
        let name = path.file_name().unwrap().to_str().unwrap();
        for byte in name.bytes().chain(fs::read(path).unwrap()) {
            hash = (hash ^ byte as u64).wrapping_mul(0x0100_0000_01b3);
        }
        writeln!(source, "    ({name:?}, include_bytes!({:?})),", path.display().to_string()).unwrap();
    }
    source.push_str("];\n");
    writeln!(source, "pub const HASH: &str = \"{hash:016x}\";").unwrap();
    fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("builtin_default.rs"), source).unwrap();
}

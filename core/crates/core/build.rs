//! Regenerates `core/include/sound_scraper.h` from the C API in `src/ffi.rs`.

use std::{env, path::PathBuf};

fn main() {
    let crate_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let core_dir = crate_dir.join("../..");
    let config_path = core_dir.join("cbindgen.toml");
    let header_path = core_dir.join("include/sound_scraper.h");

    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed={}", config_path.display());

    let config = cbindgen::Config::from_file(&config_path).expect("read cbindgen.toml");
    match cbindgen::Builder::new()
        .with_crate(&crate_dir)
        .with_config(config)
        .generate()
    {
        // write_to_file only touches the file when the contents change.
        Ok(bindings) => {
            bindings.write_to_file(&header_path);
        }
        Err(err) => panic!("cbindgen failed to generate {}: {err}", header_path.display()),
    }
}

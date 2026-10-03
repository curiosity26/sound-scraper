//! Regenerates `core/include/sound_scraper.h` from the C API in `src/ffi.rs`.

use std::{env, path::PathBuf};

fn main() {
    let crate_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let core_dir = crate_dir.join("../..");
    let config_path = core_dir.join("cbindgen.toml");
    let header_path = core_dir.join("include/sound_scraper.h");

    println!("cargo:rerun-if-changed=src");

    // LAME is a shared library (vendor/mp3lame-sys); let this crate's tests
    // and examples find it at run time.
    if let Ok(lib_dir) = env::var("DEP_MP3LAME_LIBDIR")
        && env::var("CARGO_CFG_TARGET_OS").is_ok_and(|os| os == "macos" || os == "linux")
    {
        println!("cargo:rustc-link-arg-tests=-Wl,-rpath,{lib_dir}");
        println!("cargo:rustc-link-arg-examples=-Wl,-rpath,{lib_dir}");
    }
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

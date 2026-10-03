//! Builds LAME 3.100 (vendored in lame-3.100/) as a shared library:
//! libmp3lame.0.dylib on macOS (install name @rpath/libmp3lame.0.dylib),
//! libmp3lame.so.0 on Linux, libmp3lame.dll + import lib on Windows.
//!
//! The library is also copied next to the build's binaries
//! (target/<triple>/<profile>/ and deps/) so tests and examples run, and its
//! directory is exported to dependents as DEP_MP3LAME_LIBDIR.

use std::path::{Path, PathBuf};

const LAME_DIR: &str = "lame-3.100";

fn main() {
    if std::env::var("DOCS_RS").is_ok_and(|v| v == "1") {
        return;
    }
    println!("cargo:rerun-if-changed=build.rs");
    let lib_dir = build();
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:libdir={}", lib_dir.display());
    copy_next_to_binaries(&lib_dir);
}

#[cfg(unix)]
fn build() -> PathBuf {
    let mut config = autotools::Config::new(LAME_DIR);
    // The decoder stays enabled: LAME 3.100's export list (libmp3lame.sym)
    // names the hip_* decoder functions, so a decoder-less shared build
    // fails to link.
    let host = std::env::var("HOST").unwrap();
    let target = std::env::var("TARGET").unwrap();
    if target.contains("apple") {
        let arm = target.starts_with("aarch64");
        if host != target {
            config.config_option("host", Some(if arm { "arm-apple-darwin" } else { "x86_64-apple-darwin" }));
        }
        // libtool links the dylib without the compiler's --target flag, so
        // pin the architecture explicitly.
        config.ldflag(if arm { "-arch arm64" } else { "-arch x86_64" });
    }
    let out = config
        .enable_shared()
        .disable_static()
        .disable("rpath", None)
        .disable("frontend", None)
        .disable("gtktest", None)
        .with("pic", None)
        .fast_build(true)
        .build();
    let lib_dir = out.join("lib");
    if target.contains("apple") {
        // Load from the app bundle's Frameworks folder (or any rpath).
        let dylib = lib_dir.join("libmp3lame.0.dylib");
        let ok = std::process::Command::new("install_name_tool")
            .args(["-id", "@rpath/libmp3lame.0.dylib"])
            .arg(&dylib)
            .status()
            .is_ok_and(|s| s.success());
        assert!(ok, "install_name_tool failed on {}", dylib.display());
    }
    println!("cargo:rustc-link-lib=dylib=mp3lame");
    lib_dir
}

#[cfg(windows)]
fn build() -> PathBuf {
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let lame = Path::new(LAME_DIR);
    let include_msvc = out.join("include_msvc");
    std::fs::create_dir_all(&include_msvc).unwrap();
    std::fs::copy(lame.join("configMS.h"), include_msvc.join("config.h")).unwrap();

    let sources = [
        "bitstream.c", "encoder.c", "fft.c", "gain_analysis.c", "id3tag.c", "lame.c", "newmdct.c",
        "presets.c", "psymodel.c", "quantize.c", "quantize_pvt.c", "reservoir.c", "set_get.c",
        "tables.c", "takehiro.c", "util.c", "vbrquantize.c", "VbrTag.c", "version.c",
        "vector/xmm_quantize_sub.c",
    ];
    let mut cc = cc::Build::new();
    cc.include(lame.join("include"))
        .include(lame.join("libmp3lame"))
        .include(&include_msvc)
        .define("HAVE_CONFIG_H", None)
        .define("TAKEHIRO_IEEE754_HACK", None)
        .define("FLOAT8", Some("float"))
        .define("REAL_IS_FLOAT", Some("1"))
        .define("BS_FORMAT", Some("BINARY"))
        .warnings(false);
    for s in sources {
        cc.file(lame.join("libmp3lame").join(s));
    }
    let objects = cc.compile_intermediates();

    // LAME's export list, minus the decoder (mpglib isn't built).
    let def = std::fs::read_to_string(lame.join("include").join("lame.def")).unwrap();
    let def: String = def
        .lines()
        .filter(|l| {
            let name = l.trim_start();
            !(name.starts_with("lame_decode") || name.starts_with("hip_"))
        })
        .map(|l| format!("{l}\n"))
        .collect();
    let def_path = out.join("libmp3lame.def");
    std::fs::write(&def_path, def).unwrap();

    let target = std::env::var("TARGET").unwrap();
    let mut link = cc::windows_registry::find(&target, "link.exe").expect("link.exe from Visual Studio");
    let status = link
        .arg("/NOLOGO")
        .arg("/DLL")
        .arg(format!("/DEF:{}", def_path.display()))
        .arg(format!("/OUT:{}", out.join("libmp3lame.dll").display()))
        .arg(format!("/IMPLIB:{}", out.join("libmp3lame.lib").display()))
        .args(&objects)
        .status()
        .expect("running link.exe");
    assert!(status.success(), "linking libmp3lame.dll failed");
    println!("cargo:rustc-link-lib=dylib=libmp3lame");
    out
}

/// Copies the shared library into target/<triple>/<profile>/ and its deps/.
fn copy_next_to_binaries(lib_dir: &Path) {
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR = target/<triple>/<profile>/build/<pkg>-<hash>/out
    let Some(profile_dir) = out.ancestors().nth(3) else { return };
    let names: &[&str] = if cfg!(windows) {
        &["libmp3lame.dll", "libmp3lame.lib"]
    } else if std::env::var("TARGET").unwrap().contains("apple") {
        &["libmp3lame.0.dylib"]
    } else {
        &["libmp3lame.so.0"]
    };
    for dir in [profile_dir.to_path_buf(), profile_dir.join("deps"), profile_dir.join("examples")] {
        let _ = std::fs::create_dir_all(&dir);
        for name in names {
            let _ = std::fs::copy(lib_dir.join(name), dir.join(name));
        }
    }
}

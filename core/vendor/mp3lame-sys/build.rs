//! Builds LAME 4.0 (vendored in lame-4.0/) as a shared library:
//! libmp3lame.0.dylib on macOS (install name @rpath/libmp3lame.0.dylib),
//! libmp3lame.so.0 on Linux, libmp3lame.dll + import lib on Windows.
//!
//! The sources are compiled with `cc` (upstream mp3lame-sys 0.2 dropped the
//! autotools build) and then linked into a shared library that exports
//! LAME's public encoder API (include/libmp3lame.sym, minus the decoder,
//! which isn't built).
//!
//! The library is also copied next to the build's binaries
//! (target/<triple>/<profile>/ and deps/) so tests and examples run, and its
//! directory is exported to dependents as DEP_MP3LAME_LIBDIR.

use std::path::{Path, PathBuf};
use std::process::Command;

const LAME_DIR: &str = "lame-4.0";

const SOURCES: &[&str] = &[
    "bitstream.c",
    "encoder.c",
    "fft.c",
    "gain_analysis.c",
    "id3tag.c",
    "lame.c",
    "newmdct.c",
    "presets.c",
    "psymodel.c",
    "quantize.c",
    "quantize_pvt.c",
    "reservoir.c",
    "set_get.c",
    "tables.c",
    "takehiro.c",
    "util.c",
    "vbrquantize.c",
    "VbrTag.c",
    "version.c",
];

fn main() {
    if std::env::var("DOCS_RS").is_ok_and(|v| v == "1") {
        return;
    }
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={LAME_DIR}");
    println!("cargo:rerun-if-changed=src/include/config.h");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let objects = compile();
    link(&objects, &out);
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:libdir={}", out.display());
    copy_next_to_binaries(&out);
}

fn target() -> String {
    std::env::var("TARGET").unwrap()
}

fn compile() -> Vec<PathBuf> {
    let lame = Path::new(LAME_DIR);
    let target = target();
    let mut cc = cc::Build::new();
    cc.include("src/include")
        .include(lame.join("include"))
        .include(lame.join("libmp3lame"))
        .define("HAVE_CONFIG_H", None)
        .pic(true)
        .warnings(false)
        .extra_warnings(false);
    for s in SOURCES {
        cc.file(lame.join("libmp3lame").join(s));
    }
    // Only x86_64 guarantees SSE2.
    if target.starts_with("x86_64") {
        cc.file(lame.join("libmp3lame/vector/xmm_quantize_sub.c"))
            .define("MIN_ARCH_SSE", None);
    }
    if target.contains("msvc") {
        cc.flag("/W0");
    }
    cc.compile_intermediates()
}

/// LAME's public API, without the decoder (lame_decode*, hip_*), which
/// would need mpglib.
fn exports() -> Vec<String> {
    let sym = std::fs::read_to_string(Path::new(LAME_DIR).join("include/libmp3lame.sym")).unwrap();
    sym.lines()
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with("lame_decode") && !s.starts_with("hip_"))
        .map(String::from)
        .collect()
}

#[cfg(unix)]
fn link(objects: &[PathBuf], out: &Path) {
    let target = target();
    let apple = target.contains("apple");
    let exports = exports();
    let (lib, export_flag) = if apple {
        // ld64 exported-symbols list: C names carry a leading underscore.
        let list = out.join("libmp3lame.exports");
        let names: String = exports.iter().map(|s| format!("_{s}\n")).collect();
        std::fs::write(&list, names).unwrap();
        (
            "libmp3lame.0.dylib",
            format!("-Wl,-exported_symbols_list,{}", list.display()),
        )
    } else {
        let script = out.join("libmp3lame.map");
        let names: String = exports.iter().map(|s| format!("    {s};\n")).collect();
        std::fs::write(&script, format!("{{\n  global:\n{names}  local: *;\n}};\n")).unwrap();
        (
            "libmp3lame.so.0",
            format!("-Wl,--version-script={}", script.display()),
        )
    };
    let compiler = cc::Build::new().get_compiler();
    let mut cmd: Command = compiler.to_command();
    if apple {
        cmd.args(["-dynamiclib", "-install_name", "@rpath/libmp3lame.0.dylib"]);
        cmd.args([
            "-compatibility_version",
            "1.0.0",
            "-current_version",
            "1.0.0",
        ]);
    } else {
        cmd.args([
            "-shared",
            "-Wl,-soname,libmp3lame.so.0",
            "-Wl,--no-undefined",
        ]);
    }
    let status = cmd
        .arg(export_flag)
        .arg("-o")
        .arg(out.join(lib))
        .args(objects)
        .arg("-lm")
        .status()
        .expect("running the C compiler to link libmp3lame");
    assert!(status.success(), "linking {lib} failed");
    if !apple {
        // `-lmp3lame` looks for libmp3lame.so; the binary still records the
        // soname (libmp3lame.so.0).
        let link = out.join("libmp3lame.so");
        let _ = std::fs::remove_file(&link);
        std::os::unix::fs::symlink("libmp3lame.so.0", &link).unwrap();
    } else {
        let link = out.join("libmp3lame.dylib");
        let _ = std::fs::remove_file(&link);
        std::os::unix::fs::symlink("libmp3lame.0.dylib", &link).unwrap();
    }
    println!("cargo:rustc-link-lib=dylib=mp3lame");
}

#[cfg(windows)]
fn link(objects: &[PathBuf], out: &Path) {
    // LAME's own .def keeps its ordinals; drop the decoder from it.
    let def = std::fs::read_to_string(Path::new(LAME_DIR).join("include/lame.def")).unwrap();
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

    let mut link =
        cc::windows_registry::find(&target(), "link.exe").expect("link.exe from Visual Studio");
    let status = link
        .arg("/NOLOGO")
        .arg("/DLL")
        .arg(format!("/DEF:{}", def_path.display()))
        .arg(format!("/OUT:{}", out.join("libmp3lame.dll").display()))
        .arg(format!("/IMPLIB:{}", out.join("libmp3lame.lib").display()))
        .args(objects)
        .status()
        .expect("running link.exe");
    assert!(status.success(), "linking libmp3lame.dll failed");
    println!("cargo:rustc-link-lib=dylib=libmp3lame");
}

/// Copies the shared library into target/<triple>/<profile>/ and its deps/.
fn copy_next_to_binaries(lib_dir: &Path) {
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR = target/<triple>/<profile>/build/<pkg>-<hash>/out
    let Some(profile_dir) = out.ancestors().nth(3) else {
        return;
    };
    let names: &[&str] = if cfg!(windows) {
        &["libmp3lame.dll", "libmp3lame.lib"]
    } else if target().contains("apple") {
        &["libmp3lame.0.dylib"]
    } else {
        &["libmp3lame.so.0"]
    };
    for dir in [
        profile_dir.to_path_buf(),
        profile_dir.join("deps"),
        profile_dir.join("examples"),
    ] {
        let _ = std::fs::create_dir_all(&dir);
        for name in names {
            let _ = std::fs::copy(lib_dir.join(name), dir.join(name));
        }
    }
}

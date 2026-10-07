//! Builds the macOS Disc Recording bridge (src/macos.m).

fn main() {
    println!("cargo:rerun-if-changed=src/macos.m");
    if std::env::var("CARGO_CFG_TARGET_OS").is_ok_and(|os| os == "macos") {
        cc::Build::new().file("src/macos.m").flag("-fobjc-arc").flag("-Wno-deprecated-declarations").compile("ssdr");
        println!("cargo:rustc-link-lib=framework=DiscRecording");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
}

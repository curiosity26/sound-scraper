use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use serde_json::json;

use super::*;

fn tempdir() -> PathBuf {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "sound-scraper-skin-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn png(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(w, h, image::Rgba([200, 100, 50, 255]));
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

/// A small valid skin: a 200×60 main panel with a record button only.
fn minimal_manifest() -> serde_json::Value {
    json!({
        "format": 1,
        "id": "com.example.tiny",
        "name": "Tiny",
        "colors": { "accent": "#ff0000" },
        "panels": {
            "main": {
                "size": [200, 60],
                "background": "bg.png",
                "dragRegion": [[0, 0, 200, 12]],
                "elements": {
                    "record": {
                        "rect": [4, 30, 20, 10],
                        "sprite": { "image": "btn.png", "states": { "normal": [0, 0], "pressed": [20, 0] } }
                    }
                }
            }
        }
    })
}

fn write_skin(dir: &Path, manifest: &serde_json::Value) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("skin.json"), serde_json::to_string_pretty(manifest).unwrap()).unwrap();
    fs::write(dir.join("bg.png"), png(200, 60)).unwrap();
    fs::write(dir.join("bg@2x.png"), png(400, 120)).unwrap();
    fs::write(dir.join("btn.png"), png(40, 10)).unwrap();
}

fn zip(path: &Path, entries: &[(&str, Vec<u8>)]) {
    let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for (name, bytes) in entries {
        z.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(bytes).unwrap();
    }
    z.finish().unwrap();
}

fn minimal_entries() -> Vec<(&'static str, Vec<u8>)> {
    vec![
        ("skin.json", serde_json::to_vec(&minimal_manifest()).unwrap()),
        ("bg.png", png(200, 60)),
        ("btn.png", png(40, 10)),
    ]
}

fn store() -> SkinStore {
    SkinStore::new(tempdir().join("Skins"))
}

#[test]
fn default_skin_is_complete_and_clean() {
    let skin = store().load_default().unwrap();
    assert_eq!(skin.id, DEFAULT_ID);
    assert!(skin.builtin);
    assert!(skin.warnings.is_empty(), "{:?}", skin.warnings);
    let main = &skin.panels.main;
    // Record doubles as pause in the Default skin.
    for name in manifest::MAIN_ELEMENTS.iter().filter(|n| **n != "pause") {
        let el = main.layout.elements.get(*name).unwrap_or_else(|| panic!("Default skin lacks {name}"));
        assert!(!el.fallback);
    }
    assert!(main.shade.is_some());
    let bg = main.layout.background.as_ref().unwrap();
    assert!(bg.path2x.is_some() && bg.path4x.is_some(), "Default art has @2x and @4x");
    assert!(skin.panels.library.frame.is_some() && skin.panels.library.scrollbar.is_some());
    // Colors are resolved: no @tokens left in style parameters.
    let levels = main.layout.elements["levels"].style.as_ref().unwrap();
    assert!(levels.values().all(|v| !v.as_str().is_some_and(|s| s.starts_with('@'))), "{levels:?}");
}

#[test]
fn default_skin_matches_the_schema() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let schema: serde_json::Value = serde_json::from_str(&fs::read_to_string(root.join("skin.schema.json")).unwrap()).unwrap();
    let skin: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(root.join("skins/default/skin.json")).unwrap()).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let errors: Vec<String> = validator.iter_errors(&skin).map(|e| format!("{} at {}", e, e.instance_path)).collect();
    assert!(errors.is_empty(), "{errors:#?}");
    // And the schema rejects what the loader rejects.
    let mut bad = skin.clone();
    bad["id"] = json!("Not Reverse DNS");
    assert!(!validator.is_valid(&bad));
}

/// Hi-Fi '74 (skins/hifi74), the installable test skin: loads without
/// warnings or fallbacks, matches the schema, and has needle meters.
#[test]
fn hifi_skin_is_complete_and_clean() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let dir = root.join("skins/hifi74");
    let skin = store().load_dir(&dir).unwrap();
    assert_eq!(skin.id, "com.alexboyce.soundscraper.hifi74");
    assert!(!skin.builtin);
    assert!(skin.warnings.is_empty(), "{:?}", skin.warnings);
    let main = &skin.panels.main;
    for name in manifest::MAIN_ELEMENTS.iter().filter(|n| **n != "pause") {
        let el = main.layout.elements.get(*name).unwrap_or_else(|| panic!("Hi-Fi '74 lacks {name}"));
        assert!(!el.fallback, "{name} falls back");
    }
    let levels = main.layout.elements["levels"].style.as_ref().unwrap();
    assert_eq!(levels["kind"], "needle");
    let schema: serde_json::Value = serde_json::from_str(&fs::read_to_string(root.join("skin.schema.json")).unwrap()).unwrap();
    let manifest: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("skin.json")).unwrap()).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let errors: Vec<String> = validator.iter_errors(&manifest).map(|e| format!("{} at {}", e, e.instance_path)).collect();
    assert!(errors.is_empty(), "{errors:#?}");
}

#[test]
fn missing_elements_fall_back_to_default() {
    let store = store();
    let dir = tempdir().join("tiny");
    let mut m = minimal_manifest();
    m["panels"]["main"]["size"] = json!([420, 150]);
    write_skin(&dir, &m);
    let skin = store.load_dir(&dir).unwrap();
    let els = &skin.panels.main.layout.elements;
    assert!(!els["record"].fallback);
    assert!(els["stop"].fallback && els["elapsed"].fallback);
    assert_eq!(els["record"].sprite.as_ref().unwrap().image.path, dir.canonicalize().unwrap().join("btn.png"));
    // Fallback sprites still point into the Default skin's folder.
    assert!(els["stop"].sprite.as_ref().unwrap().image.path.starts_with(store.builtin_dir().unwrap().canonicalize().unwrap()));
    // Fonts, colors, shade and frame panels come from the Default skin.
    assert!(skin.fonts.contains_key("lcd"));
    assert_eq!(skin.colors["accent"], "#ff0000");
    assert!(skin.colors.contains_key("lcdLit"));
    assert!(skin.panels.main.shade.as_ref().unwrap().elements.values().all(|e| e.fallback));
    assert!(skin.panels.library.frame.is_some());
    assert!(skin.panels.library.title.is_some() && skin.panels.settings.close.is_some());
    assert!(skin.panels.details.frame.is_some() && skin.panels.details.resizable, "details falls back to Default");
    assert!(skin.panels.details.menu.is_some() && skin.panels.library.menu.is_none());
    assert!(skin.warnings.is_empty(), "{:?}", skin.warnings);
}

#[test]
fn fallbacks_that_dont_fit_are_left_out_with_a_warning() {
    let dir = tempdir().join("tiny");
    write_skin(&dir, &minimal_manifest());
    let skin = store().load_dir(&dir).unwrap();
    let els = &skin.panels.main.layout.elements;
    assert!(els.contains_key("record"));
    assert!(!els.contains_key("toggleSettings"), "Default's toggle at x=346 can't fit 200 wide");
    assert!(skin.warnings.iter().any(|w| w.contains("toggleSettings") && w.contains("doesn't fit")), "{:?}", skin.warnings);
}

#[test]
fn reports_unknown_keys_and_elements() {
    let dir = tempdir().join("tiny");
    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["sprit"] = json!(1);
    m["panels"]["main"]["elements"]["eject"] = json!({ "rect": [0, 0, 5, 5] });
    write_skin(&dir, &m);
    let skin = store().load_dir(&dir).unwrap();
    assert!(skin.warnings.iter().any(|w| w.contains("sprit")), "{:?}", skin.warnings);
    assert!(skin.warnings.iter().any(|w| w.contains("eject") && w.contains("unknown element")));
}

fn load_err(m: serde_json::Value) -> String {
    let dir = tempdir().join("bad");
    write_skin(&dir, &m);
    store().load_dir(&dir).unwrap_err()
}

#[test]
fn validation_errors_name_the_problem() {
    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["rect"] = json!([190, 30, 20, 10]);
    let e = load_err(m);
    assert!(e.contains("panels.main.elements.record.rect [190, 30, 20, 10]") && e.contains("200×60"), "{e}");

    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["sprite"]["states"]["pressed"] = json!([30, 0]);
    let e = load_err(m);
    assert!(e.contains("states.pressed") && e.contains("btn.png"), "{e}");

    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["sprite"]["states"] = json!({ "pressed": [0, 0] });
    assert!(load_err(m).contains("needs a \"normal\" state"));

    let mut m = minimal_manifest();
    m["panels"]["main"]["background"] = json!("missing.png");
    assert!(load_err(m).contains("missing.png is missing"));

    let mut m = minimal_manifest();
    m["panels"]["main"]["background"] = json!("../outside.png");
    assert!(load_err(m).contains("\"..\" is not allowed"));

    let mut m = minimal_manifest();
    m["panels"]["main"]["background"] = json!("/etc/hosts.png");
    assert!(load_err(m).contains("absolute paths"));

    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["style"] = json!({ "on": "@nope" });
    assert!(load_err(m).contains("unknown color token @nope"));

    let mut m = minimal_manifest();
    m["colors"]["accent"] = json!("red");
    assert!(load_err(m).contains("\"red\" is not a color"));

    let mut m = minimal_manifest();
    m["format"] = json!(2);
    assert!(load_err(m).contains("format 2 is not supported"));

    let mut m = minimal_manifest();
    m["id"] = json!("../../evil");
    assert!(load_err(m).contains("must be reverse-DNS"));

    let mut m = minimal_manifest();
    m["panels"]["main"]["elements"]["record"]["font"] = json!("nope");
    assert!(load_err(m).contains("no font named \"nope\""));

    let mut m = minimal_manifest();
    m["panels"]["library"] = json!({ "title": { "font": "nope", "offset": [4, 4] } });
    assert!(load_err(m).contains("panels.library.title.font"));

    let mut m = minimal_manifest();
    m["panels"]["settings"] = json!({ "close": { "offset": [4, 4], "size": [30, 10],
        "sprite": { "image": "btn.png", "states": { "normal": [20, 0] } } } });
    assert!(load_err(m).contains("panels.settings.close.sprite.states.normal"));
}

#[test]
fn animations_and_presets() {
    let dir = tempdir().join("anim");
    let mut m = minimal_manifest();
    m["panels"]["main"]["animations"] = json!([{
        "name": "spin",
        "rect": [100, 20, 20, 10],
        "sprite": { "image": "btn.png", "states": { "a": [0, 0], "b": [20, 0] } },
        "frames": ["a", "b", "a"],
        "fps": 8,
        "speed": "level"
    }]);
    m["visualizer"] = json!({ "presets": [
        { "name": "Hot", "style": "fire", "bands": 12, "color": "@accent", "gradient": ["@accent", "#00ff00"] }
    ]});
    write_skin(&dir, &m);
    let skin = store().load_dir(&dir).unwrap();
    let a = &skin.panels.main.layout.animations[0];
    assert_eq!((a.frames.len(), a.fps, a.play.as_str(), a.speed.as_str()), (3, 8.0, "recording", "level"));
    let p = &skin.visualizer.presets[0];
    assert_eq!(p["color"], "#ff0000");
    assert_eq!(p["gradient"], json!(["#ff0000", "#00ff00"]));
    // Default skin: reels spin while recording; five looks.
    let default = store().load_default().unwrap();
    assert_eq!(default.panels.main.layout.animations.len(), 2);
    assert!(default.visualizer.presets.len() >= 5);

    let bad = |patch: &dyn Fn(&mut serde_json::Value), expect: &str| {
        let mut m2 = m.clone();
        patch(&mut m2);
        let e = load_err(m2);
        assert!(e.contains(expect), "{e}");
    };
    bad(&|m| m["panels"]["main"]["animations"][0]["frames"] = json!(["a", "zz"]), "\"zz\" is not a state");
    bad(&|m| m["panels"]["main"]["animations"][0]["frames"] = json!([]), "at least one");
    bad(&|m| m["panels"]["main"]["animations"][0]["fps"] = json!(0), "fps");
    bad(&|m| m["panels"]["main"]["animations"][0]["play"] = json!("sometimes"), "play must be");
    bad(&|m| m["panels"]["main"]["animations"][0]["rect"] = json!([190, 20, 20, 10]), "animations[0].rect");
    bad(&|m| m["visualizer"]["presets"][0]["style"] = json!("lasers"), "style must be");
    bad(&|m| m["visualizer"]["presets"][0]["bands"] = json!(65), "bands must be");
    bad(&|m| m["visualizer"]["presets"][0]["color"] = json!("@nope"), "unknown color token @nope");
}

#[test]
fn checks_images() {
    let dir = tempdir().join("img");
    write_skin(&dir, &minimal_manifest());
    fs::write(dir.join("bg@2x.png"), png(401, 120)).unwrap();
    let e = store().load_dir(&dir).unwrap_err();
    assert!(e.contains("bg@2x.png") && e.contains("twice the size"), "{e}");

    fs::write(dir.join("bg@2x.png"), png(400, 120)).unwrap();
    fs::write(dir.join("bg@4x.png"), png(800, 200)).unwrap();
    let e = store().load_dir(&dir).unwrap_err();
    assert!(e.contains("bg@4x.png") && e.contains("four times"), "{e}");
    fs::write(dir.join("bg@4x.png"), png(800, 240)).unwrap();
    let skin = store().load_dir(&dir).unwrap();
    assert!(skin.panels.main.layout.background.unwrap().path4x.unwrap().ends_with("bg@4x.png"));

    fs::remove_file(dir.join("bg@2x.png")).unwrap();
    fs::remove_file(dir.join("bg@4x.png")).unwrap();
    fs::write(dir.join("bg.png"), b"not a png").unwrap();
    assert!(store().load_dir(&dir).unwrap_err().contains("bg.png: not a valid image"));

    fs::write(dir.join("bg.png"), png(4097, 1)).unwrap();
    let e = store().load_dir(&dir).unwrap_err();
    assert!(e.contains("4097×1") && e.contains("at most 4096"), "{e}");
}

#[test]
fn folders_reject_symlinks_and_unknown_file_types() {
    let dir = tempdir().join("links");
    write_skin(&dir, &minimal_manifest());
    fs::write(dir.join("script.js"), b"alert(1)").unwrap();
    assert!(store().load_dir(&dir).unwrap_err().contains("script.js: only images"));
    fs::remove_file(dir.join("script.js")).unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/etc/hosts", dir.join("hosts.txt")).unwrap();
        assert!(store().load_dir(&dir).unwrap_err().contains("hosts.txt: symbolic links"));
        fs::remove_file(dir.join("hosts.txt")).unwrap();
    }
    // Dot folders (an author's .git) are ignored.
    fs::create_dir_all(dir.join(".git")).unwrap();
    fs::write(dir.join(".git/config"), b"x").unwrap();
    store().load_dir(&dir).unwrap();
}

#[test]
fn install_list_load_remove() {
    let store = store();
    let archive = tempdir().join("tiny.sskin");
    zip(&archive, &minimal_entries());
    let installed = store.install(&archive).unwrap();
    assert_eq!(installed.id, "com.example.tiny");
    assert_eq!(installed.dir, store.skins_dir().join("com.example.tiny"));

    let list = store.list();
    assert_eq!(list.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), [DEFAULT_ID, "com.example.tiny"]);
    assert!(list[0].builtin && list.iter().all(|s| s.error.is_none()));

    let skin = store.load("com.example.tiny").unwrap();
    assert_eq!(skin.name, "Tiny");
    assert_eq!(store.load(DEFAULT_ID).unwrap().id, DEFAULT_ID);

    // Reinstalling replaces it.
    let mut m = minimal_manifest();
    m["name"] = json!("Tiny 2");
    let mut entries = minimal_entries();
    entries[0].1 = serde_json::to_vec(&m).unwrap();
    zip(&archive, &entries);
    store.install(&archive).unwrap();
    assert_eq!(store.load("com.example.tiny").unwrap().name, "Tiny 2");

    store.remove("com.example.tiny").unwrap();
    assert_eq!(store.list().len(), 1);
    assert!(store.load("com.example.tiny").unwrap_err().contains("not installed"));
    assert!(store.remove(DEFAULT_ID).unwrap_err().contains("built in"));
    assert!(store.remove("../Skins").is_err());
    // Nothing is left behind from staging.
    let leftovers: Vec<_> = fs::read_dir(store.skins_dir())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with(".builtin-"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn installs_archives_with_a_wrapping_folder() {
    let store = store();
    let archive = tempdir().join("wrapped.sskin");
    let entries: Vec<(String, Vec<u8>)> =
        minimal_entries().into_iter().map(|(n, b)| (format!("Tiny Skin/{n}"), b)).collect();
    let mut entries: Vec<(&str, Vec<u8>)> = entries.iter().map(|(n, b)| (n.as_str(), b.clone())).collect();
    entries.push(("__MACOSX/._skin.json", vec![0, 1]));
    entries.push(("Tiny Skin/.DS_Store", vec![0]));
    zip(&archive, &entries);
    assert_eq!(store.install(&archive).unwrap().id, "com.example.tiny");
}

fn install_err(entries: &[(&str, Vec<u8>)]) -> (String, SkinStore) {
    let store = store();
    let archive = tempdir().join("bad.sskin");
    zip(&archive, entries);
    (store.install(&archive).unwrap_err(), store)
}

#[test]
fn rejects_zip_slip() {
    let mut entries = minimal_entries();
    entries.push(("../escaped.png", png(1, 1)));
    let (e, store) = install_err(&entries);
    assert!(e.contains("\"..\" is not allowed"), "{e}");
    let parent = store.skins_dir().parent().unwrap();
    assert!(!parent.join("escaped.png").exists() && !store.skins_dir().join("escaped.png").exists());

    let mut entries = minimal_entries();
    entries.push(("images/../../escaped.png", png(1, 1)));
    assert!(install_err(&entries).0.contains("\"..\" is not allowed"));

    let mut entries = minimal_entries();
    entries.push(("/tmp/absolute.png", png(1, 1)));
    assert!(install_err(&entries).0.contains("absolute paths"));

    let mut entries = minimal_entries();
    entries.push(("C:/windows.png", png(1, 1)));
    assert!(install_err(&entries).0.contains("only relative paths"));

    let mut entries = minimal_entries();
    entries.push(("evil\\..\\x.png", png(1, 1)));
    assert!(install_err(&entries).0.contains("only relative paths"));
}

#[test]
fn rejects_symlink_entries() {
    let store = store();
    let archive = tempdir().join("link.sskin");
    let mut z = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
    for (name, bytes) in minimal_entries() {
        z.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(&bytes).unwrap();
    }
    z.add_symlink("hosts.png", "/etc/hosts", zip::write::SimpleFileOptions::default()).unwrap();
    z.finish().unwrap();
    let e = store.install(&archive).unwrap_err();
    assert!(e.contains("hosts.png: symbolic links"), "{e}");
}

#[test]
fn rejects_bad_archives() {
    let mut entries = minimal_entries();
    entries.push(("install.sh", b"rm -rf ~".to_vec()));
    assert!(install_err(&entries).0.contains("install.sh: only images"));

    let names: Vec<String> = (0..files::MAX_FILES).map(|i| format!("n{i}.txt")).collect();
    let mut entries = minimal_entries();
    entries.extend(names.iter().map(|n| (n.as_str(), Vec::new())));
    assert!(install_err(&entries).0.contains("more than 500 files"));

    assert!(install_err(&[("readme.txt", b"hi".to_vec())]).0.contains("skin.json is missing"));

    let store = store();
    let not_zip = tempdir().join("x.sskin");
    fs::write(&not_zip, b"hello").unwrap();
    assert!(store.install(&not_zip).unwrap_err().contains("not a valid skin archive"));

    // A zip bomb is stopped by the unpacked size, counted from the data.
    let mut entries = minimal_entries();
    let big = vec![0u8; (files::MAX_UNPACKED_BYTES + 1) as usize];
    entries.push(("big.txt", big));
    let (e, _) = install_err(&entries);
    assert!(e.contains("larger than 100 MB"), "{e}");

    let mut m = minimal_manifest();
    m["id"] = json!(DEFAULT_ID);
    let mut entries = minimal_entries();
    entries[0].1 = serde_json::to_vec(&m).unwrap();
    assert!(install_err(&entries).0.contains("can't be replaced"));
}

#[test]
fn lists_broken_installs_with_an_error() {
    let store = store();
    let dir = store.skins_dir().join("com.example.broken");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("skin.json"), "{").unwrap();
    let list = store.list();
    assert_eq!(list.len(), 2);
    assert!(list[1].error.as_ref().unwrap().contains("skin.json"));
}

#[test]
fn inspects_without_installing() {
    let store = store();
    let archive = tempdir().join("tiny.sskin");
    zip(&archive, &minimal_entries());
    let found = store.inspect(&archive).unwrap();
    assert_eq!((found.id.as_str(), found.name.as_str()), ("com.example.tiny", "Tiny"));
    assert!(found.installed.is_none());
    assert!(found.preview.as_ref().is_some_and(|p| p.is_file()));
    assert_eq!(store.list().len(), 1, "inspecting doesn't install");
    // Nothing left behind but the preview.
    let leftovers: Vec<_> = fs::read_dir(store.skins_dir())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with(".builtin-") && n != ".previews")
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
    // Once installed, a new copy names the installed one.
    store.install(&archive).unwrap();
    assert_eq!(store.inspect(&archive).unwrap().installed.unwrap().id, "com.example.tiny");
    // A broken archive says why.
    let bad = tempdir().join("bad.sskin");
    zip(&bad, &[("readme.txt", b"hi".to_vec())]);
    assert!(store.inspect(&bad).unwrap_err().contains("skin.json"));
}

#[test]
fn previews_are_cached_until_the_skin_changes() {
    let store = store();
    let dir = tempdir().join("work");
    write_skin(&dir, &minimal_manifest());
    let skin = store.load_dir(&dir).unwrap();
    let first = store.preview(&skin).unwrap();
    assert!(first.is_file());
    assert_eq!(store.preview(&skin).unwrap(), first);
    fs::write(dir.join("notes.txt"), "changed").unwrap();
    let second = store.preview(&skin).unwrap();
    assert_ne!(second, first);
    assert!(!first.exists(), "the old picture is removed");
    let default = store.load_default().unwrap();
    assert!(store.preview(&default).unwrap().is_file());
}

#[test]
fn packages_a_folder_that_installs() {
    let store = store();
    let dir = tempdir().join("work");
    write_skin(&dir, &minimal_manifest());
    fs::create_dir_all(dir.join(".git")).unwrap();
    fs::write(dir.join(".git/HEAD"), "ref").unwrap();
    fs::write(dir.join(".DS_Store"), "junk").unwrap();
    let out = tempdir().join("Tiny.sskin");
    let packaged = store.package(&dir, &out).unwrap();
    assert_eq!((packaged.id.as_str(), packaged.dir.as_path()), ("com.example.tiny", out.as_path()));
    let names: Vec<String> = {
        let mut zip = zip::ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
        (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().to_string()).collect()
    };
    assert_eq!(names, ["bg.png", "bg@2x.png", "btn.png", "skin.json"]);
    assert_eq!(store.install(&out).unwrap().id, "com.example.tiny");
    // Broken folders aren't packaged.
    let mut broken = minimal_manifest();
    broken["panels"]["main"]["background"] = json!("missing.png");
    let bad = tempdir().join("bad");
    write_skin(&bad, &broken);
    let bad_out = tempdir().join("Bad.sskin");
    assert!(store.package(&bad, &bad_out).unwrap_err().contains("missing.png"));
    assert!(!bad_out.exists());
}

#[test]
fn templates_start_from_the_default_skin() {
    let store = store();
    let parent = tempdir();
    let dir = store.create_from_template(&parent, "Neon Nights").unwrap();
    assert_eq!(dir, parent.join("Neon Nights"));
    let skin = store.load_dir(&dir).unwrap();
    assert_eq!((skin.id.as_str(), skin.name.as_str()), ("com.example.neon-nights", "Neon Nights"));
    assert!(skin.warnings.is_empty(), "{:?}", skin.warnings);
    assert!(fs::read_to_string(dir.join("README.md")).unwrap().contains("nine-slice"));
    assert!(store.create_from_template(&parent, "Neon Nights").unwrap_err().contains("already exists"));
    assert!(store.create_from_template(&parent, "../up").is_err());
}

#[test]
fn folder_stamp_tracks_changes() {
    let dir = tempdir().join("work");
    write_skin(&dir, &minimal_manifest());
    let a = crate::folder_stamp(&dir).unwrap();
    assert_eq!(crate::folder_stamp(&dir).unwrap(), a);
    fs::write(dir.join("btn.png"), png(40, 12)).unwrap();
    let b = crate::folder_stamp(&dir).unwrap();
    assert_ne!(a, b);
    fs::write(dir.join(".hidden"), "x").unwrap();
    assert_eq!(crate::folder_stamp(&dir).unwrap(), b, "dot files don't count");
}

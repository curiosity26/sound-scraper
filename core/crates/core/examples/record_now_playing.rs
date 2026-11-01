//! Records with now-playing tagging and splitting on, then prints what it
//! did: a manual test of the whole pipeline before the UI exists.
//!
//!   cargo run --example record_now_playing -- [seconds] [app-pid] [dir]
//!
//! Recordings go to `dir` (default: a temp folder); drafts to the app's
//! normal editor data folder.

use std::time::Duration;

use sound_scraper_core::{Recorder, edit::edits, nowplaying, recorder::RecorderOptions, sources};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let seconds: f64 = args.first().and_then(|s| s.parse().ok()).unwrap_or(60.0);
    let pid = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .filter(|&p: &u32| p != 0);
    let dir = args
        .get(2)
        .map(Into::into)
        .unwrap_or_else(|| std::env::temp_dir().join("sound-scraper-now-playing-test"));
    let mut recorder = Recorder::new();
    recorder.set_options(RecorderOptions {
        dir,
        ..RecorderOptions::default()
    });
    let source = sources::source_for_pid(pid);
    println!(
        "recording {} for {seconds} s…",
        sources::source_label(&source)
    );
    if let Err(e) = recorder.start(source) {
        eprintln!("start failed: {e}");
        std::process::exit(1);
    }
    std::thread::sleep(Duration::from_secs_f64(seconds));
    let path = match recorder.stop() {
        Ok(path) => path,
        Err(e) => {
            eprintln!("stop failed: {e}");
            std::process::exit(1);
        }
    };
    println!("wrote {}", path.display());
    match sound_scraper_core::tags::read(&path) {
        Ok(tags) => println!("tags: {tags:?}"),
        Err(e) => println!("tags: {e}"),
    }
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    for m in nowplaying::load_markers(&name) {
        println!(
            "marker {:>9.1} ms  {:<40} partial={} ad={} unsnapped={} tags={:?}",
            m.at_ms, m.title, m.partial, m.ad, m.unsnapped, m.tags
        );
    }
    match edits::load_draft(&name) {
        Some(draft) => println!(
            "draft in {}: {}",
            edits::draft_dir(&name).display(),
            serde_json::to_string_pretty(&draft).unwrap_or_default()
        ),
        None => println!("no draft"),
    }
}

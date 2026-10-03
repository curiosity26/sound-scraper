//! Records a capture test WAV from the command line.
//!
//!   cargo run --example capture_wav -- list
//!   cargo run --example capture_wav -- [seconds] [app-pid]

use sound_scraper_core::{capture_test, sources};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("list") {
        for app in sources::audio_apps() {
            let marker = if app.is_playing { "♪" } else { " " };
            println!("{marker} {:>6}  {}  ({})", app.pid, app.name, app.bundle_id.unwrap_or_default());
        }
        return;
    }
    let seconds = args.first().and_then(|s| s.parse().ok()).unwrap_or(10.0);
    let pid = args.get(1).and_then(|s| s.parse().ok());
    match capture_test::record_test_wav(pid, seconds) {
        Ok(r) => println!(
            "wrote {} ({} frames, {} Hz, {} ch, peak {:.3})",
            r.path.display(),
            r.frames,
            r.sample_rate,
            r.channels,
            r.peak
        ),
        Err(e) => {
            eprintln!("capture failed: {e}");
            std::process::exit(1);
        }
    }
}

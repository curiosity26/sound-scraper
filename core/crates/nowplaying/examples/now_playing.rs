//! Prints what the OS now-playing service reports for 60 seconds, to try a
//! backend by hand: `cargo run -p sound_scraper_nowplaying --example now_playing`.

use std::{
    sync::mpsc,
    time::{Duration, Instant},
};

fn main() {
    let mut backend = sound_scraper_nowplaying::default_backend();
    let (sink, events) = mpsc::channel();
    if let Err(e) = backend.start(sink) {
        eprintln!("{e}");
        std::process::exit(1);
    }
    let end = Instant::now() + Duration::from_secs(60);
    while let Some(left) = end.checked_duration_since(Instant::now()) {
        match events.recv_timeout(left) {
            Ok(event) => println!("{event:#?}"),
            Err(mpsc::RecvTimeoutError::Timeout) => break,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                eprintln!("backend stopped reporting");
                break;
            }
        }
    }
    backend.stop();
}

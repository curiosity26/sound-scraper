//! Plays a recording through the default output, printing progress:
//! `cargo run --example play -- <file.mp3> [seek seconds]`.

use std::{path::PathBuf, sync::Arc, time::Duration};

use sound_scraper_core::player::{Player, PlayerEvent, PlayerState};
use sound_scraper_vis::VisHub;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = PathBuf::from(args.next().expect("usage: play <file.mp3> [seek seconds]"));
    let seek = args.next().and_then(|s| s.parse::<f64>().ok());
    let mut player = Player::new(VisHub::new());
    player.set_event_sink(Some(Arc::new(|e: &PlayerEvent| match e {
        PlayerEvent::Progress { position, duration, peak, .. } => {
            println!("{:>6.2}/{:.2}s  peak L {:.2} R {:.2}", position.as_secs_f64(), duration.as_secs_f64(), peak[0], peak[1])
        }
        other => println!("{other:?}"),
    })));
    player.load(&path).unwrap();
    if let Some(s) = seek {
        player.seek(Duration::from_secs_f64(s)).unwrap();
    }
    player.play().unwrap();
    while player.state() == PlayerState::Playing {
        std::thread::sleep(Duration::from_millis(50));
    }
}

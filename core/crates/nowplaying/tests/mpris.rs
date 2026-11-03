//! End-to-end check of the MPRIS backend against a fake player on a real
//! session bus. Skipped (passes trivially) without `DBUS_SESSION_BUS_ADDRESS`;
//! to run it anywhere: `dbus-run-session -- cargo test -p
//! sound_scraper_nowplaying --test mpris`.
#![cfg(target_os = "linux")]

use std::{
    collections::HashMap,
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};

use sound_scraper_nowplaying::{BackendEvent, PlaybackState, PlayerId, Snapshot, default_backend};
use zbus::{OwnedVariant, Variant, block_on, connection, object_server::SignalEmitter};

const PATH: &str = "/org/mpris/MediaPlayer2";
const TIMEOUT: Duration = Duration::from_secs(10);

struct FakePlayer {
    title: String,
    artists: Vec<String>,
    status: String,
}

#[zbus::interface(name = "org.mpris.MediaPlayer2.Player")]
impl FakePlayer {
    #[zbus(property)]
    fn metadata(&self) -> HashMap<String, OwnedVariant> {
        let entries = [
            ("xesam:title", Variant::from(self.title.as_str())),
            ("xesam:artist", Variant::from(self.artists.clone())),
            ("mpris:length", Variant::I64(180_000_000)),
        ];
        entries
            .into_iter()
            .filter_map(|(k, v)| Some((k.to_owned(), v.try_to_owned().ok()?)))
            .collect()
    }

    #[zbus(property)]
    fn playback_status(&self) -> String {
        self.status.clone()
    }

    #[zbus(property)]
    fn position(&self) -> i64 {
        42_000_000
    }

    #[zbus(signal)]
    async fn seeked(emitter: &SignalEmitter<'_>, position: i64) -> zbus::Result<()>;
}

/// Waits for the first event about `app_id` that `pick` accepts, skipping
/// everything else (other players on a developer's bus, repeats).
fn wait_for<T>(
    rx: &Receiver<BackendEvent>,
    app_id: &str,
    mut pick: impl FnMut(BackendEvent) -> Option<T>,
) -> T {
    let deadline = Instant::now() + TIMEOUT;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        let event = rx
            .recv_timeout(left)
            .unwrap_or_else(|e| panic!("no matching event for {app_id}: {e}"));
        let about = match &event {
            BackendEvent::Updated(s) => &s.player,
            BackendEvent::Removed(p) => p,
            BackendEvent::Seeked { player, .. } => player,
        };
        if about.app_id != app_id {
            continue;
        }
        if let Some(found) = pick(event) {
            return found;
        }
    }
}

fn updated(event: BackendEvent) -> Option<Snapshot> {
    match event {
        BackendEvent::Updated(s) => Some(*s),
        _ => None,
    }
}

#[test]
fn reports_fake_player_lifecycle() {
    if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none() {
        eprintln!("skipping: no D-Bus session bus");
        return;
    }
    let name = format!(
        "org.mpris.MediaPlayer2.soundscraper_test_{}",
        std::process::id()
    );
    let player_conn = block_on(
        connection::Builder::session()
            .name(name.as_str())
            .serve_at(
                PATH,
                FakePlayer {
                    title: "First".into(),
                    artists: vec!["A".into(), "B".into()],
                    status: "Playing".into(),
                },
            )
            .build(),
    )
    .unwrap();

    let mut backend = default_backend();
    let (tx, rx) = mpsc::channel();
    backend.start(tx).unwrap();

    // Already present at start.
    let first = wait_for(&rx, &name, updated);
    let track = first.track.clone().unwrap();
    assert_eq!(track.title.as_deref(), Some("First"));
    assert_eq!(track.artist.as_deref(), Some("A, B"));
    assert_eq!(track.duration, Some(Duration::from_secs(180)));
    assert_eq!(first.state, PlaybackState::Playing);
    assert_eq!(first.position, Some(Duration::from_secs(42)));
    assert!(first.position_at.is_some());
    assert_eq!(first.player.pid, Some(std::process::id()));
    assert!(backend.owns(&first.player, std::process::id(), None));

    // A metadata change.
    let iface = block_on(player_conn.object_server().interface::<_, FakePlayer>(PATH)).unwrap();
    {
        let mut player = block_on(iface.get_mut());
        player.title = "Second".into();
        player.status = "Paused".into();
    }
    block_on(block_on(iface.get()).metadata_changed(iface.signal_emitter())).unwrap();
    let second = wait_for(&rx, &name, |e| {
        updated(e).filter(|s| s.track.as_ref().and_then(|t| t.title.as_deref()) == Some("Second"))
    });
    assert_eq!(second.state, PlaybackState::Paused);

    // A seek.
    block_on(FakePlayer::seeked(iface.signal_emitter(), 5_000_000)).unwrap();
    let position = wait_for(&rx, &name, |e| match e {
        BackendEvent::Seeked { position, .. } => Some(position),
        _ => None,
    });
    assert_eq!(position, Duration::from_secs(5));

    // Removal.
    block_on(player_conn.release_name(name.as_str())).unwrap();
    let removed: PlayerId = wait_for(&rx, &name, |e| match e {
        BackendEvent::Removed(p) => Some(p),
        _ => None,
    });
    assert_eq!(removed, first.player);

    // And a reappearance is picked up as a new player.
    block_on(player_conn.request_name(name.as_str())).unwrap();
    wait_for(&rx, &name, updated);

    let stop_started = Instant::now();
    backend.stop();
    assert!(stop_started.elapsed() < Duration::from_secs(3));
}

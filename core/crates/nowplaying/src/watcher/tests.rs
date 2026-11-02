use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::*;
use crate::{Artwork, fake::FakeBackend};

const DEBOUNCE: Duration = Duration::from_millis(300);

/// A fixed epoch plus `ms`, so tests read as offsets.
fn t(ms: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(1_700_000_000) + Duration::from_millis(ms)
}

fn secs(s: u64) -> Duration {
    Duration::from_secs(s)
}

fn player(app_id: &str, pid: u32) -> PlayerId {
    PlayerId {
        app_id: app_id.into(),
        pid: Some(pid),
        parent_app_id: None,
    }
}

fn spotify() -> PlayerId {
    player("spotify", 100)
}

fn chrome() -> PlayerId {
    player("chrome", 200)
}

fn track(title: &str, artist: Option<&str>) -> Track {
    Track {
        title: Some(title.into()),
        artist: artist.map(Into::into),
        ..Track::default()
    }
}

fn snapshot(player: PlayerId, track: Option<Track>, state: PlaybackState) -> Snapshot {
    Snapshot {
        player,
        track,
        state,
        position: None,
        position_at: None,
        is_current: false,
    }
}

fn playing(player: PlayerId, track: Track) -> Snapshot {
    snapshot(player, Some(track), PlaybackState::Playing)
}

fn at_position(mut snapshot: Snapshot, position: Duration, at: SystemTime) -> Snapshot {
    snapshot.position = Some(position);
    snapshot.position_at = Some(at);
    snapshot
}

fn updated(snapshot: Snapshot) -> BackendEvent {
    BackendEvent::Updated(Box::new(snapshot))
}

fn config() -> WatcherConfig {
    WatcherConfig {
        debounce: DEBOUNCE,
        tick: Duration::from_millis(5),
    }
}

/// The fake backend's ownership rule: a player belongs to its pid.
fn owns_by_pid() -> OwnsFn {
    Box::new(|player, pid, _| player.pid == Some(pid))
}

fn system_tracker() -> Tracker {
    Tracker::new(Target::System, config(), owns_by_pid())
}

fn app_tracker(pid: u32) -> Tracker {
    let target = Target::App {
        pid,
        bundle_id: None,
        name: "app".into(),
    };
    Tracker::new(target, config(), owns_by_pid())
}

fn changes(events: &[WatchEvent]) -> Vec<&TrackChange> {
    events
        .iter()
        .filter_map(|event| match event {
            WatchEvent::TrackChanged(change) => Some(change),
            _ => None,
        })
        .collect()
}

fn titles(events: &[WatchEvent]) -> Vec<String> {
    changes(events)
        .iter()
        .map(|change| change.track.title.clone().unwrap())
        .collect()
}

/// Plays `title` on `player` from `ms` and lets the debounce fire.
fn play_settled(tracker: &mut Tracker, player: PlayerId, title: &str, ms: u64) -> Vec<WatchEvent> {
    let mut out = tracker.on_event(updated(playing(player, track(title, Some("A")))), t(ms));
    out.extend(tracker.on_tick(t(ms) + DEBOUNCE));
    out
}

#[test]
fn given_metadata_burst_when_fields_arrive_over_time_then_one_change_and_one_update() {
    let mut tracker = system_tracker();
    let mut out = Vec::new();
    out.extend(tracker.on_event(updated(playing(spotify(), track("Song", None))), t(0)));
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("Song", Some("Band")))),
        t(100),
    ));
    let mut with_album = track("Song", Some("Band"));
    with_album.album = Some("Record".into());
    out.extend(tracker.on_event(updated(playing(spotify(), with_album.clone())), t(200)));
    out.extend(tracker.on_tick(t(250)));
    assert!(changes(&out).is_empty(), "debounce not yet elapsed");
    out.extend(tracker.on_tick(t(300)));

    let mut with_art = with_album.clone();
    with_art.artwork = Some(Artwork {
        mime: "image/png".into(),
        data: vec![1, 2, 3].into(),
    });
    out.extend(tracker.on_event(updated(playing(spotify(), with_art.clone())), t(600)));
    // The same snapshot again, and one that has lost its art for a moment.
    out.extend(tracker.on_event(updated(playing(spotify(), with_art.clone())), t(700)));
    out.extend(tracker.on_event(updated(playing(spotify(), with_album.clone())), t(800)));
    out.extend(tracker.on_tick(t(2000)));

    let found = changes(&out);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].track, with_album);
    assert_eq!(found[0].started_at, t(0));
    assert_eq!(found[0].joined_at, Duration::ZERO);
    assert_eq!(found[0].player, spotify());
    let updates: Vec<_> = out
        .iter()
        .filter(|event| matches!(event, WatchEvent::TrackUpdated(_)))
        .collect();
    assert_eq!(updates, vec![&WatchEvent::TrackUpdated(with_art)]);
}

#[test]
fn given_new_title_with_stale_artist_when_artist_corrects_then_one_change_with_new_artist() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Old", 0);
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("New", Some("A")))),
        t(1000),
    ));
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("New", Some("B")))),
        t(1100),
    ));
    out.extend(tracker.on_tick(t(1300)));

    let found = changes(&out);
    assert_eq!(titles(&out), ["Old", "New"]);
    assert_eq!(found[1].track.artist.as_deref(), Some("B"));
    assert_eq!(found[1].started_at, t(1000));
}

#[test]
fn given_title_still_changing_when_debounce_elapses_from_first_title_then_only_last_reported() {
    let mut tracker = system_tracker();
    let mut out = tracker.on_event(updated(playing(spotify(), track("One", None))), t(0));
    out.extend(tracker.on_event(updated(playing(spotify(), track("Two", None))), t(200)));
    out.extend(tracker.on_tick(t(400)));
    assert!(out.is_empty(), "Two has only been stable for 200 ms");
    out.extend(tracker.on_tick(t(500)));
    assert_eq!(titles(&out), ["Two"]);
}

#[test]
fn given_empty_fields_between_songs_when_next_song_arrives_then_gap_ignored() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "First", 0);
    let blank = Track {
        title: Some("  ".into()),
        artist: Some(String::new()),
        ..Track::default()
    };
    out.extend(tracker.on_event(updated(playing(spotify(), blank)), t(1000)));
    out.extend(tracker.on_event(
        updated(snapshot(spotify(), None, PlaybackState::Playing)),
        t(1050),
    ));
    out.extend(tracker.on_tick(t(1500)));
    assert_eq!(titles(&out), ["First"]);
    assert!(
        !out.iter().any(|e| matches!(e, WatchEvent::TrackUpdated(_))),
        "{out:?}"
    );

    out.extend(play_settled(&mut tracker, spotify(), "Second", 1600));
    assert_eq!(titles(&out), ["First", "Second"]);
}

#[test]
fn given_flicker_to_other_title_when_current_returns_within_debounce_then_no_change() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(updated(playing(spotify(), track("Ad", None))), t(1000)));
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("Song", Some("A")))),
        t(1100),
    ));
    out.extend(tracker.on_tick(t(2000)));
    assert_eq!(titles(&out), ["Song"]);
}

#[test]
fn given_case_and_whitespace_differences_when_same_song_then_not_a_change() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(
        updated(playing(spotify(), track(" SONG ", Some("a")))),
        t(1000),
    ));
    out.extend(tracker.on_tick(t(2000)));
    assert_eq!(titles(&out), ["Song"]);
}

#[test]
fn given_different_track_ids_when_metadata_identical_then_new_track() {
    let mut tracker = system_tracker();
    let mut first = track("Intro", Some("A"));
    first.id = Some("/track/1".into());
    let mut second = first.clone();
    second.id = Some("/track/2".into());
    let mut out = tracker.on_event(updated(playing(spotify(), first)), t(0));
    out.extend(tracker.on_tick(t(300)));
    out.extend(tracker.on_event(updated(playing(spotify(), second)), t(1000)));
    out.extend(tracker.on_tick(t(1300)));
    assert_eq!(titles(&out), ["Intro", "Intro"]);
}

#[test]
fn given_one_track_id_for_every_video_when_title_changes_then_new_track() {
    // Firefox reports "/org/mpris/MediaPlayer2/firefox" for every video.
    let mut tracker = system_tracker();
    let mut first = track("Choosin' Texas", Some("Ella Langley"));
    first.id = Some("/org/mpris/MediaPlayer2/firefox".into());
    let mut second = track("Video Ad", Some("YouTube Ads 310"));
    second.id = first.id.clone();
    let mut out = tracker.on_event(updated(playing(chrome(), first)), t(0));
    out.extend(tracker.on_tick(t(300)));
    out.extend(tracker.on_event(updated(playing(chrome(), second)), t(1000)));
    out.extend(tracker.on_tick(t(1300)));
    assert_eq!(titles(&out), ["Choosin' Texas", "Video Ad"]);
}

#[test]
fn given_position_when_song_changes_then_started_at_is_position_at_minus_position() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "First", 0);
    let next = at_position(
        playing(spotify(), track("Second", Some("A"))),
        Duration::from_millis(800),
        t(10_000),
    );
    out.extend(tracker.on_event(updated(next), t(10_050)));
    out.extend(tracker.on_tick(t(10_400)));
    let found = changes(&out);
    assert_eq!(found[1].started_at, t(9_200));
    assert_eq!(found[1].joined_at, Duration::ZERO);
}

#[test]
fn given_first_track_already_in_progress_when_watcher_starts_then_joined_mid_song() {
    let mut tracker = system_tracker();
    let first = at_position(
        playing(spotify(), track("Long", Some("A"))),
        secs(60),
        t(500),
    );
    let mut out = tracker.on_event(updated(first), t(1000));
    out.extend(tracker.on_tick(t(1300)));
    let found = changes(&out);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].started_at, t(1000));
    assert_eq!(found[0].joined_at, Duration::from_millis(60_500));
}

#[test]
fn given_first_track_near_its_start_when_watcher_starts_then_not_joined() {
    let mut tracker = system_tracker();
    let first = at_position(
        playing(spotify(), track("Fresh", Some("A"))),
        secs(1),
        t(1000),
    );
    let mut out = tracker.on_event(updated(first), t(1000));
    out.extend(tracker.on_tick(t(1300)));
    let found = changes(&out);
    assert_eq!(found[0].started_at, t(0));
    assert_eq!(found[0].joined_at, Duration::ZERO);
}

#[test]
fn given_second_track_reports_large_position_when_changed_then_not_joined() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "First", 0);
    let next = at_position(
        playing(spotify(), track("Skipped into", Some("A"))),
        secs(30),
        t(40_000),
    );
    out.extend(tracker.on_event(updated(next), t(40_000)));
    out.extend(tracker.on_tick(t(40_300)));
    let found = changes(&out);
    assert_eq!(found[1].started_at, t(10_000));
    assert_eq!(found[1].joined_at, Duration::ZERO);
}

#[test]
fn given_no_position_when_debounce_fires_later_then_started_at_is_first_sighting() {
    let mut tracker = system_tracker();
    let mut out = tracker.on_event(updated(playing(spotify(), track("Song", None))), t(1000));
    out.extend(tracker.on_tick(t(1750)));
    assert_eq!(changes(&out)[0].started_at, t(1000));
}

#[test]
fn given_system_target_when_only_one_player_plays_then_it_is_followed() {
    let mut tracker = system_tracker();
    let mut out = tracker.on_event(
        updated(snapshot(
            chrome(),
            Some(track("Paused video", None)),
            PlaybackState::Paused,
        )),
        t(0),
    );
    out.extend(play_settled(&mut tracker, spotify(), "Song", 100));
    assert_eq!(titles(&out), ["Song"]);
    assert_eq!(changes(&out)[0].player, spotify());
    assert!(
        !out.iter().any(|e| matches!(e, WatchEvent::Paused { .. })),
        "{out:?}"
    );
}

#[test]
fn given_system_target_when_another_player_starts_then_switch_is_a_track_change() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(
        updated(snapshot(
            spotify(),
            Some(track("Song", Some("A"))),
            PlaybackState::Paused,
        )),
        t(5000),
    ));
    out.extend(play_settled(&mut tracker, chrome(), "Video", 6000));
    assert_eq!(titles(&out), ["Song", "Video"]);
    assert_eq!(changes(&out)[1].player, chrome());
    assert_eq!(
        out.iter()
            .filter(|e| !matches!(e, WatchEvent::TrackChanged(_)))
            .collect::<Vec<_>>(),
        [
            &WatchEvent::Paused { at: t(5000) },
            &WatchEvent::Resumed { at: t(6000) }
        ]
    );
}

#[test]
fn given_followed_player_paused_when_other_player_updates_paused_then_keep_following() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(
        updated(snapshot(
            spotify(),
            Some(track("Song", Some("A"))),
            PlaybackState::Paused,
        )),
        t(1000),
    ));
    out.extend(tracker.on_event(
        updated(snapshot(
            chrome(),
            Some(track("Video", None)),
            PlaybackState::Paused,
        )),
        t(2000),
    ));
    out.extend(tracker.on_tick(t(3000)));
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("Song", Some("A")))),
        t(4000),
    ));
    assert_eq!(titles(&out), ["Song"]);
    assert_eq!(
        out[1..],
        [
            WatchEvent::Paused { at: t(1000) },
            WatchEvent::Resumed { at: t(4000) }
        ]
    );
}

#[test]
fn given_two_players_playing_when_one_is_current_then_current_session_preferred() {
    let mut tracker = system_tracker();
    let mut current = playing(chrome(), track("Video", None));
    current.is_current = true;
    let mut out = tracker.on_event(updated(current), t(0));
    out.extend(tracker.on_event(updated(playing(spotify(), track("Song", None))), t(100)));
    out.extend(tracker.on_tick(t(1000)));
    assert_eq!(titles(&out), ["Video"]);
}

#[test]
fn given_two_players_playing_when_neither_is_current_then_most_recent_starter_preferred() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(play_settled(&mut tracker, chrome(), "Video", 1000));
    // Spotify keeps sending updates while still playing: Chrome started later.
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("Song", Some("A")))),
        t(2000),
    ));
    out.extend(tracker.on_tick(t(3000)));
    assert_eq!(titles(&out), ["Song", "Video"]);
}

#[test]
fn given_switch_to_player_on_same_song_when_settled_then_no_track_change() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(play_settled(&mut tracker, chrome(), "Song", 1000));
    assert_eq!(titles(&out), ["Song"]);
}

#[test]
fn given_followed_player_removed_when_system_target_then_paused() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(BackendEvent::Removed(spotify()), t(1000)));
    assert_eq!(out[1..], [WatchEvent::Paused { at: t(1000) }]);
}

#[test]
fn given_app_target_when_other_apps_play_then_they_are_ignored() {
    let mut tracker = app_tracker(100);
    let mut out = play_settled(&mut tracker, chrome(), "Video", 0);
    assert!(out.is_empty(), "{out:?}");
    out.extend(play_settled(&mut tracker, spotify(), "Song", 1000));
    out.extend(play_settled(&mut tracker, chrome(), "Other video", 2000));
    assert_eq!(titles(&out), ["Song"]);
    assert_eq!(changes(&out)[0].player, spotify());
}

#[test]
fn given_app_target_when_its_player_is_paused_then_track_still_reported_and_paused() {
    let mut tracker = app_tracker(100);
    let mut out = tracker.on_event(
        updated(snapshot(
            spotify(),
            Some(track("Song", None)),
            PlaybackState::Paused,
        )),
        t(0),
    );
    out.extend(tracker.on_tick(t(300)));
    assert_eq!(out[0], WatchEvent::Paused { at: t(0) });
    assert_eq!(titles(&out), ["Song"]);
}

#[test]
fn given_app_target_when_owns_asked_repeatedly_then_cached_per_player() {
    let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counter = std::sync::Arc::clone(&calls);
    let owns: OwnsFn = Box::new(move |player, pid, _| {
        counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        player.pid == Some(pid)
    });
    let target = Target::App {
        pid: 100,
        bundle_id: None,
        name: "app".into(),
    };
    let mut tracker = Tracker::new(target, config(), owns);
    for ms in [0, 100, 200] {
        tracker.on_event(updated(playing(spotify(), track("Song", None))), t(ms));
        tracker.on_event(updated(playing(chrome(), track("Video", None))), t(ms));
    }
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
}

#[test]
fn given_playing_when_paused_and_resumed_then_events_carry_position_time() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    let paused = at_position(
        snapshot(
            spotify(),
            Some(track("Song", Some("A"))),
            PlaybackState::Paused,
        ),
        secs(5),
        t(5000),
    );
    out.extend(tracker.on_event(updated(paused.clone()), t(5100)));
    // A repeat of the paused state is not another pause.
    out.extend(tracker.on_event(updated(paused), t(5200)));
    out.extend(tracker.on_event(
        updated(playing(spotify(), track("Song", Some("A")))),
        t(9000),
    ));
    let mut stopped = playing(spotify(), track("Song", Some("A")));
    stopped.state = PlaybackState::Stopped;
    out.extend(tracker.on_event(updated(stopped), t(9500)));
    assert_eq!(
        out[1..],
        [
            WatchEvent::Paused { at: t(5000) },
            WatchEvent::Resumed { at: t(9000) },
            WatchEvent::Paused { at: t(9500) },
        ]
    );
}

#[test]
fn given_seek_when_position_jumps_then_no_track_change() {
    let mut tracker = system_tracker();
    let mut out = play_settled(&mut tracker, spotify(), "Song", 0);
    out.extend(tracker.on_event(
        BackendEvent::Seeked {
            player: spotify(),
            position: secs(120),
            at: t(1000),
        },
        t(1000),
    ));
    out.extend(tracker.on_event(
        BackendEvent::Seeked {
            player: spotify(),
            position: Duration::ZERO,
            at: t(2000),
        },
        t(2000),
    ));
    out.extend(tracker.on_tick(t(5000)));
    assert_eq!(titles(&out), ["Song"]);
    assert_eq!(out.len(), 1);
}

fn with_duration(title: &str, duration: Duration) -> Track {
    Track {
        duration: Some(duration),
        ..track(title, Some("A"))
    }
}

#[test]
fn given_song_past_ninety_percent_when_it_restarts_near_zero_then_replay_is_new_track() {
    let mut tracker = system_tracker();
    let song = with_duration("Loop", secs(100));
    let start = at_position(playing(spotify(), song.clone()), Duration::ZERO, t(0));
    let mut out = tracker.on_event(updated(start), t(0));
    out.extend(tracker.on_tick(t(300)));
    // No updates while it plays; 101 s later it reports position 1 s.
    let again = at_position(playing(spotify(), song), secs(1), t(101_000));
    out.extend(tracker.on_event(updated(again), t(101_000)));
    out.extend(tracker.on_tick(t(101_300)));
    let found = changes(&out);
    assert_eq!(titles(&out), ["Loop", "Loop"]);
    assert_eq!(found[1].started_at, t(100_000));
    assert_eq!(found[1].joined_at, Duration::ZERO);
}

#[test]
fn given_song_at_half_when_it_jumps_to_zero_then_not_a_replay() {
    let mut tracker = system_tracker();
    let song = with_duration("Loop", secs(100));
    let start = at_position(playing(spotify(), song.clone()), Duration::ZERO, t(0));
    let mut out = tracker.on_event(updated(start), t(0));
    out.extend(tracker.on_tick(t(300)));
    let back = at_position(playing(spotify(), song), Duration::ZERO, t(50_000));
    out.extend(tracker.on_event(updated(back), t(50_000)));
    out.extend(tracker.on_tick(t(51_000)));
    assert_eq!(titles(&out), ["Loop"]);
}

#[test]
fn given_seek_back_to_start_near_end_when_next_update_arrives_then_not_a_replay() {
    let mut tracker = system_tracker();
    let song = with_duration("Loop", secs(100));
    let start = at_position(playing(spotify(), song.clone()), Duration::ZERO, t(0));
    let mut out = tracker.on_event(updated(start), t(0));
    out.extend(tracker.on_tick(t(300)));
    out.extend(tracker.on_event(
        BackendEvent::Seeked {
            player: spotify(),
            position: Duration::ZERO,
            at: t(95_000),
        },
        t(95_000),
    ));
    let after = at_position(playing(spotify(), song), secs(1), t(96_000));
    out.extend(tracker.on_event(updated(after), t(96_000)));
    out.extend(tracker.on_tick(t(97_000)));
    assert_eq!(titles(&out), ["Loop"]);
}

#[test]
fn given_paused_near_end_when_it_restarts_then_progress_counts_only_while_playing() {
    let mut tracker = system_tracker();
    let song = with_duration("Loop", secs(100));
    let start = at_position(playing(spotify(), song.clone()), Duration::ZERO, t(0));
    let mut out = tracker.on_event(updated(start), t(0));
    out.extend(tracker.on_tick(t(300)));
    let mut paused = at_position(playing(spotify(), song.clone()), secs(10), t(10_000));
    paused.state = PlaybackState::Paused;
    out.extend(tracker.on_event(updated(paused), t(10_000)));
    // Long after, it plays from the start: progress was only 10%.
    let again = at_position(playing(spotify(), song), Duration::ZERO, t(500_000));
    out.extend(tracker.on_event(updated(again), t(500_000)));
    out.extend(tracker.on_tick(t(501_000)));
    assert_eq!(titles(&out), ["Loop"]);
}

#[test]
fn given_fake_backend_when_watcher_runs_then_events_flow_end_to_end() {
    let backend = FakeBackend::new();
    let handle = backend.handle();
    let target = Target::App {
        pid: 100,
        bundle_id: None,
        name: "Spotify".into(),
    };
    let fast = WatcherConfig {
        debounce: Duration::from_millis(30),
        tick: Duration::from_millis(5),
    };
    let (watcher, events) = Watcher::start_with(Box::new(backend), target, fast).unwrap();

    let now = SystemTime::now();
    assert!(handle.send(updated(playing(chrome(), track("Video", None)))));
    assert!(handle.send(updated(at_position(
        playing(spotify(), track("Song", None)),
        secs(1),
        now,
    ))));
    assert!(handle.send(updated(playing(spotify(), track("Song", Some("Band"))))));
    let timeout = Duration::from_secs(5);
    let WatchEvent::TrackChanged(change) = events.recv_timeout(timeout).unwrap() else {
        panic!("expected a track change");
    };
    assert_eq!(change.track, track("Song", Some("Band")));
    assert_eq!(change.player, spotify());
    assert_eq!(change.started_at, now - secs(1));

    let mut paused = playing(spotify(), track("Song", Some("Band")));
    paused.state = PlaybackState::Paused;
    paused.position_at = Some(now);
    assert!(handle.send(updated(paused)));
    assert_eq!(
        events.recv_timeout(timeout).unwrap(),
        WatchEvent::Paused { at: now }
    );

    watcher.stop();
    assert!(!handle.send(updated(playing(spotify(), track("After", None)))));
    assert!(events.recv_timeout(Duration::from_millis(50)).is_err());
}

#[test]
fn given_unavailable_backend_when_watcher_starts_then_error_returned() {
    let result = Watcher::start(Box::new(crate::fake::Unavailable), Target::System);
    assert!(matches!(result, Err(NowPlayingError::Unavailable(_))));
}

#[test]
fn given_running_watcher_when_dropped_then_backend_stopped() {
    let backend = FakeBackend::new();
    let handle = backend.handle();
    let (watcher, _events) = Watcher::start(Box::new(backend), Target::System).unwrap();
    assert!(handle.send(updated(playing(spotify(), track("Song", None)))));
    drop(watcher);
    assert!(!handle.send(updated(playing(spotify(), track("Song", None)))));
}

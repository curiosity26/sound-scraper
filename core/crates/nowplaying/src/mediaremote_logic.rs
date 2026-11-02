//! The OS-independent rules of the macOS backend (`macos.rs`): reading
//! mediaremote-adapter's JSON stream and the AppleScript fallback's output,
//! turning raw player states into backend events, and matching players to
//! the captured app. Kept apart from the process plumbing so their tests run
//! on any host.

// Off macOS only the tests use these.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::Engine as _;
use serde_json::{Map, Value};

use crate::{
    Artwork, BackendEvent, PlaybackState, PlayerId, Snapshot, Track,
    smtc_logic::{MAX_ARTWORK_BYTES, Mark, artwork_mime},
};

/// Players report a track change as several updates (title first, then the
/// rest and a reset position). A position jump this close to a track change
/// belongs to the new track, not a seek.
pub(crate) const TRACK_CHANGE_GRACE: Duration = Duration::from_secs(1);

/// mediaremote-adapter's `stream` state: the last full payload with every
/// diff since applied.
#[derive(Debug, Default)]
pub(crate) struct AdapterState {
    payload: Map<String, Value>,
    /// The last decoded artwork, keyed by its base64 text, so unchanged
    /// artwork isn't decoded again for every update.
    artwork: Option<(String, Artwork)>,
}

impl AdapterState {
    /// Takes one line of `stream` output. Lines are
    /// `{"type":"data","diff":bool,"payload":{...}}`; a diff sets the keys it
    /// names and removes those it sets to null. Returns whether the line was
    /// a data line.
    pub fn apply_line(&mut self, line: &str) -> bool {
        let Ok(Value::Object(mut message)) = serde_json::from_str::<Value>(line) else {
            return false;
        };
        if message.get("type").and_then(Value::as_str) != Some("data") {
            return false;
        }
        let diff = message
            .get("diff")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let payload = match message.remove("payload") {
            Some(Value::Object(payload)) => payload,
            Some(Value::Null) | None => Map::new(),
            Some(_) => return false,
        };
        if !diff {
            self.payload = payload;
            return true;
        }
        for (key, value) in payload {
            if value.is_null() {
                self.payload.remove(&key);
            } else {
                self.payload.insert(key, value);
            }
        }
        true
    }

    /// What the payload says is playing; `None` when no player reports
    /// anything (an empty payload). Times are the `--micros` keys.
    pub fn snapshot(&mut self) -> Option<Snapshot> {
        let p = &self.payload;
        let pid = p
            .get("processIdentifier")
            .and_then(Value::as_u64)
            .and_then(|n| u32::try_from(n).ok())
            .filter(|&n| n > 0);
        let app_id = text(p, "bundleIdentifier").or_else(|| pid.map(|pid| format!("pid:{pid}")))?;
        let playing = p.get("playing").and_then(Value::as_bool).unwrap_or(false);
        let track = Track {
            title: text(p, "title"),
            artist: text(p, "artist"),
            album: text(p, "album"),
            album_artist: None,
            track_number: count(p, "trackNumber"),
            track_count: count(p, "totalTrackCount"),
            genre: text(p, "genre"),
            duration: micros(p, "durationMicros").filter(|d| !d.is_zero()),
            artwork: None,
            id: identifier(p, "uniqueIdentifier")
                .or_else(|| identifier(p, "contentItemIdentifier")),
        };
        let has_track = track.title.is_some() || track.artist.is_some() || track.album.is_some();
        let player = PlayerId {
            app_id,
            pid,
            parent_app_id: text(p, "parentApplicationBundleIdentifier"),
        };
        let position = micros(p, "elapsedTimeMicros");
        let position_at = micros(p, "timestampEpochMicros").and_then(|d| UNIX_EPOCH.checked_add(d));
        let artwork = if has_track { self.artwork() } else { None };
        Some(Snapshot {
            player,
            track: has_track.then_some(Track { artwork, ..track }),
            state: if playing {
                PlaybackState::Playing
            } else {
                PlaybackState::Paused
            },
            position,
            position_at: position.and(position_at),
            // MediaRemote reports only the system's own pick.
            is_current: true,
        })
    }

    fn artwork(&mut self) -> Option<Artwork> {
        let Some(encoded) = self.payload.get("artworkData").and_then(Value::as_str) else {
            self.artwork = None;
            return None;
        };
        if let Some((cached, artwork)) = &self.artwork
            && cached == encoded
        {
            return Some(artwork.clone());
        }
        let content_type = text(&self.payload, "artworkMimeType").unwrap_or_default();
        let artwork = decode_artwork(encoded, &content_type)?;
        self.artwork = Some((encoded.to_owned(), artwork.clone()));
        Some(artwork)
    }
}

fn decode_artwork(encoded: &str, content_type: &str) -> Option<Artwork> {
    // Base64 is 4 characters per 3 bytes.
    if encoded.len() as u64 / 4 * 3 > MAX_ARTWORK_BYTES {
        return None;
    }
    let data = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    let mime = artwork_mime(&data, content_type)?;
    Some(Artwork {
        mime,
        data: data.into(),
    })
}

fn text(payload: &Map<String, Value>, key: &str) -> Option<String> {
    let text = payload.get(key)?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// An id that players give as text or as a number (Music's
/// `uniqueIdentifier`).
fn identifier(payload: &Map<String, Value>, key: &str) -> Option<String> {
    match payload.get(key)? {
        Value::Number(n) => Some(n.to_string()),
        _ => text(payload, key),
    }
}

/// A positive whole number; players use 0 for "unknown".
fn count(payload: &Map<String, Value>, key: &str) -> Option<u32> {
    let n = payload.get(key)?.as_f64()?;
    (n >= 1.0 && n <= f64::from(u32::MAX)).then_some(n as u32)
}

fn micros(payload: &Map<String, Value>, key: &str) -> Option<Duration> {
    let n = payload.get(key)?.as_f64()?;
    (n.is_finite() && n >= 0.0).then(|| Duration::from_micros(n as u64))
}

/// The AppleScript fallback's players, and what the poll asks each one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ScriptPlayer {
    Music,
    Spotify,
}

impl ScriptPlayer {
    pub const ALL: [ScriptPlayer; 2] = [ScriptPlayer::Music, ScriptPlayer::Spotify];

    pub fn bundle_id(self) -> &'static str {
        match self {
            Self::Music => "com.apple.Music",
            Self::Spotify => "com.spotify.client",
        }
    }

    /// The executable's name, to find its process.
    pub fn process_name(self) -> &'static str {
        match self {
            Self::Music => "Music",
            Self::Spotify => "Spotify",
        }
    }

    /// A script that prints the player's state and current track as
    /// [`FIELD_SEPARATOR`]-separated fields (see [`parse_script_output`]),
    /// `stopped` when it has no current track. Only run it while the player
    /// is running: a `tell` would launch it.
    pub fn status_script(self) -> String {
        // Times as whole milliseconds: reals print with the user's decimal
        // separator. Music gives seconds, Spotify milliseconds.
        let (id, duration, extra) = match self {
            Self::Music => (
                "persistent ID of t",
                "((duration of t) * 1000) as integer",
                "track count of t, genre of t, \"\"",
            ),
            Self::Spotify => ("id of t", "duration of t", "\"\", \"\", artwork url of t"),
        };
        format!(
            r#"on f(v)
	try
		if v is missing value then return ""
		return v as text
	on error
		return ""
	end try
end f
tell application id "{bundle}"
	set s to player state as text
	try
		set t to current track
	on error
		return "stopped"
	end try
	if s is "stopped" then return "stopped"
	set fields to {{s}}
	repeat with v in {{{id}, name of t, artist of t, album of t, album artist of t, track number of t, {extra}}}
		set end of fields to my f(contents of v)
	end repeat
	try
		set end of fields to ({duration}) as text
	on error
		set end of fields to ""
	end try
	try
		set end of fields to ((player position * 1000) as integer) as text
	on error
		set end of fields to ""
	end try
end tell
set AppleScript's text item delimiters to character id 31
return fields as text"#,
            bundle = self.bundle_id(),
        )
    }
}

/// How long the adapter gets to report a player before the AppleScript
/// fallback asks one that is making sound. The adapter answers within a
/// second when it works; asking earlier would show the Automation prompt to
/// people who never need the fallback.
pub(crate) const FALLBACK_GRACE: Duration = Duration::from_secs(3);

/// What the adapter is doing, for [`fallback_wanted`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AdapterHealth {
    /// It couldn't start, or it exited.
    Gone,
    /// It runs and reports a player.
    Reporting,
    /// It runs but reports nothing (nothing plays, or a future macOS
    /// closed the workaround).
    Silent,
}

/// Whether the AppleScript fallback should ask a player (Music or Spotify,
/// already known to be running) what it plays:
/// - always when the adapter is gone;
/// - never while the adapter reports a player;
/// - while it is silent, once the player has been making sound
///   (`sound_for`, from CoreAudio) for [`FALLBACK_GRACE`] past the first
///   `FALLBACK_GRACE` after starting; then for as long as it stays silent
///   (`asking`: the fallback already asks this player), so a pause is seen.
pub(crate) fn fallback_wanted(
    adapter: AdapterHealth,
    since_start: Duration,
    sound_for: Option<Duration>,
    asking: bool,
) -> bool {
    match adapter {
        AdapterHealth::Gone => true,
        AdapterHealth::Reporting => false,
        AdapterHealth::Silent => {
            asking
                || (since_start >= FALLBACK_GRACE && sound_for.is_some_and(|d| d >= FALLBACK_GRACE))
        }
    }
}

/// Whether `bundle_id`, or a helper of it, is in CoreAudio's list of
/// processes making sound.
pub(crate) fn makes_sound(bundle_id: &str, playing: &[String]) -> bool {
    playing.iter().any(|p| {
        p.eq_ignore_ascii_case(bundle_id)
            || p.get(..bundle_id.len()).is_some_and(|prefix| {
                prefix.eq_ignore_ascii_case(bundle_id)
                    && p.as_bytes().get(bundle_id.len()) == Some(&b'.')
            })
    })
}

/// Separates the status script's fields (ASCII unit separator).
pub(crate) const FIELD_SEPARATOR: char = '\u{1f}';

/// One status script result.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ScriptStatus {
    pub state: PlaybackState,
    pub track: Track,
    pub position: Option<Duration>,
    /// Spotify's cover, to fetch separately.
    pub artwork_url: Option<String>,
}

/// Reads [`ScriptPlayer::status_script`]'s output: `None` when the player
/// has no current track (stopped) or the output is not what the script
/// prints.
pub(crate) fn parse_script_output(output: &str) -> Option<ScriptStatus> {
    let output = output.trim_end_matches(['\n', '\r']);
    let fields: Vec<&str> = output.split(FIELD_SEPARATOR).collect();
    let [
        state,
        id,
        title,
        artist,
        album,
        album_artist,
        track_number,
        track_count,
        genre,
        artwork_url,
        duration_ms,
        position_ms,
    ] = fields[..]
    else {
        return None;
    };
    let state = match state.trim() {
        "playing" | "fast forwarding" | "rewinding" => PlaybackState::Playing,
        "paused" => PlaybackState::Paused,
        _ => return None,
    };
    let non_empty = |s: &str| {
        let s = s.trim();
        (!s.is_empty()).then(|| s.to_owned())
    };
    let positive = |s: &str| s.trim().parse::<u32>().ok().filter(|&n| n > 0);
    let millis = |s: &str| s.trim().parse::<u64>().ok().map(Duration::from_millis);
    Some(ScriptStatus {
        state,
        track: Track {
            title: non_empty(title),
            artist: non_empty(artist),
            album: non_empty(album),
            album_artist: non_empty(album_artist),
            track_number: positive(track_number),
            track_count: positive(track_count),
            genre: non_empty(genre),
            duration: millis(duration_ms).filter(|d| !d.is_zero()),
            artwork: None,
            id: non_empty(id),
        },
        position: millis(position_ms),
        artwork_url: non_empty(artwork_url).filter(|url| url.starts_with("https://")),
    })
}

/// Reads binary data as `osascript` prints it: `«data JPEG FFD8…»` (a
/// four-character type code, then hex).
pub(crate) fn parse_script_data(output: &str) -> Option<Vec<u8>> {
    let inner = output.trim().strip_prefix("«data ")?.strip_suffix('»')?;
    let hex = inner.get(4..)?;
    if hex.len() % 2 != 0 || hex.len() as u64 / 2 > MAX_ARTWORK_BYTES {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok())
        .collect()
}

/// Cover art from raw image bytes, when they are an image we can use.
pub(crate) fn artwork_from_bytes(data: Vec<u8>, content_type: &str) -> Option<Artwork> {
    let mime = artwork_mime(&data, content_type)?;
    Some(Artwork {
        mime,
        data: Arc::from(data),
    })
}

/// Whether `player` belongs to the captured app: the same bundle ID (or,
/// for web playback, the parent app's), or its process descends from `pid`.
/// `parent_of` gives a process's parent.
pub(crate) fn owns(
    player: &PlayerId,
    pid: u32,
    bundle_id: Option<&str>,
    parent_of: impl Fn(u32) -> Option<u32>,
) -> bool {
    if let Some(bundle_id) = bundle_id.filter(|b| !b.is_empty())
        && (player.app_id.eq_ignore_ascii_case(bundle_id)
            || player
                .parent_app_id
                .as_deref()
                .is_some_and(|parent| parent.eq_ignore_ascii_case(bundle_id)))
    {
        return true;
    }
    // Walk up from the player; launchd (1) and the kernel (0) own everyone.
    if pid <= 1 {
        return false;
    }
    let mut next = player.pid;
    for _ in 0..64 {
        match next {
            Some(p) if p == pid => return true,
            Some(p) if p > 1 => next = parent_of(p),
            _ => return false,
        }
    }
    false
}

/// Turns each player's raw state, as often as a source reports it, into
/// backend events: `Updated` when anything but the position moved, `Seeked`
/// when the position jumped within one track, `Removed` when a player goes.
#[derive(Debug, Default)]
pub(crate) struct Reporter {
    players: HashMap<PlayerId, Reported>,
}

#[derive(Debug)]
struct Reported {
    last: Snapshot,
    mark: Option<Mark>,
    track_changed_at: SystemTime,
}

impl Reporter {
    pub fn update(&mut self, mut snapshot: Snapshot, now: SystemTime) -> Vec<BackendEvent> {
        let at = snapshot.position_at.unwrap_or(now);
        let playing = snapshot.state == PlaybackState::Playing;
        let fresh_mark = snapshot.position.map(|position| Mark {
            position,
            at,
            playing,
        });
        let Some(entry) = self.players.get_mut(&snapshot.player) else {
            self.players.insert(
                snapshot.player.clone(),
                Reported {
                    last: snapshot.clone(),
                    mark: fresh_mark,
                    track_changed_at: now,
                },
            );
            return vec![BackendEvent::Updated(Box::new(snapshot))];
        };
        let mut out = Vec::new();
        // MediaRemote often flips play/pause without a new timeline reading;
        // the old reading is then stale.
        let new_reading = snapshot.position != entry.last.position
            || snapshot.position_at != entry.last.position_at;
        if !same_track(entry.last.track.as_ref(), snapshot.track.as_ref()) {
            entry.track_changed_at = now;
            entry.mark = fresh_mark;
        } else if let Some(mark) = &mut entry.mark {
            // Play/pause happened now, whatever the reading's time says.
            mark.set_playing(playing, now);
            match snapshot.position {
                Some(position) if new_reading => {
                    let jumped = mark.advance(position, at);
                    let settled = now
                        .duration_since(entry.track_changed_at)
                        .unwrap_or_default()
                        >= TRACK_CHANGE_GRACE;
                    if jumped && settled {
                        out.push(BackendEvent::Seeked {
                            player: snapshot.player.clone(),
                            position,
                            at,
                        });
                    }
                }
                Some(_) if snapshot.state != entry.last.state => {
                    snapshot.position = Some(mark.position);
                    snapshot.position_at = Some(mark.at);
                }
                _ => {}
            }
        } else {
            entry.mark = fresh_mark;
        }
        if !same_except_position(&entry.last, &snapshot) {
            out.push(BackendEvent::Updated(Box::new(snapshot.clone())));
        }
        entry.last = snapshot;
        out
    }

    /// Forgets `player`; reports it gone if it was known.
    pub fn remove(&mut self, player: &PlayerId) -> Option<BackendEvent> {
        self.players
            .remove(player)
            .map(|_| BackendEvent::Removed(player.clone()))
    }

    /// Forgets every player `keep` rejects, reporting each gone.
    pub fn retain(&mut self, keep: impl Fn(&PlayerId) -> bool) -> Vec<BackendEvent> {
        let gone: Vec<PlayerId> = self
            .players
            .keys()
            .filter(|id| !keep(id))
            .cloned()
            .collect();
        gone.iter().filter_map(|id| self.remove(id)).collect()
    }

    pub fn last(&self, player: &PlayerId) -> Option<&Snapshot> {
        self.players.get(player).map(|entry| &entry.last)
    }
}

/// The same song: what the player shows, and its own id when it gives one.
pub(crate) fn same_track(a: Option<&Track>, b: Option<&Track>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => {
            a.title == b.title && a.artist == b.artist && a.album == b.album && a.id == b.id
        }
        (None, None) => true,
        _ => false,
    }
}

fn same_except_position(a: &Snapshot, b: &Snapshot) -> bool {
    a.player == b.player && a.track == b.track && a.state == b.state && a.is_current == b.is_current
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(secs: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    fn secs(s: u64) -> Duration {
        Duration::from_secs(s)
    }

    const PNG: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    fn full_line() -> String {
        let artwork = base64::engine::general_purpose::STANDARD.encode(PNG);
        format!(
            r#"{{"type":"data","diff":false,"payload":{{"bundleIdentifier":"com.apple.Music","processIdentifier":812,"playing":true,"title":"So What","artist":"Miles Davis","album":"Kind of Blue","durationMicros":562000000,"elapsedTimeMicros":12500000,"timestampEpochMicros":1700000000000000,"trackNumber":1,"totalTrackCount":5,"genre":"Jazz","uniqueIdentifier":6800026501,"artworkMimeType":"image/png","artworkData":"{artwork}"}}}}"#
        )
    }

    #[test]
    fn full_payloads_become_snapshots() {
        let mut state = AdapterState::default();
        assert!(state.apply_line(&full_line()));
        let snapshot = state.snapshot().unwrap();
        assert_eq!(
            snapshot.player,
            PlayerId {
                app_id: "com.apple.Music".into(),
                pid: Some(812),
                parent_app_id: None,
            }
        );
        assert_eq!(snapshot.state, PlaybackState::Playing);
        assert_eq!(snapshot.position, Some(Duration::from_millis(12_500)));
        assert_eq!(snapshot.position_at, Some(at(1_700_000_000)));
        assert!(snapshot.is_current);
        let track = snapshot.track.unwrap();
        assert_eq!(track.title.as_deref(), Some("So What"));
        assert_eq!(track.artist.as_deref(), Some("Miles Davis"));
        assert_eq!(track.album.as_deref(), Some("Kind of Blue"));
        assert_eq!(track.track_number, Some(1));
        assert_eq!(track.track_count, Some(5));
        assert_eq!(track.genre.as_deref(), Some("Jazz"));
        assert_eq!(track.duration, Some(secs(562)));
        assert_eq!(track.id.as_deref(), Some("6800026501"));
        let artwork = track.artwork.unwrap();
        assert_eq!(artwork.mime, "image/png");
        assert_eq!(&*artwork.data, PNG);
    }

    #[test]
    fn diffs_update_and_remove_keys() {
        let mut state = AdapterState::default();
        state.apply_line(&full_line());
        assert!(state.apply_line(
            r#"{"type":"data","diff":true,"payload":{"playing":false,"genre":null,"elapsedTimeMicros":20000000}}"#
        ));
        let snapshot = state.snapshot().unwrap();
        assert_eq!(snapshot.state, PlaybackState::Paused);
        assert_eq!(snapshot.position, Some(secs(20)));
        let track = snapshot.track.unwrap();
        assert_eq!(track.genre, None);
        assert_eq!(track.title.as_deref(), Some("So What"));
        assert!(track.artwork.is_some());
    }

    #[test]
    fn empty_payloads_mean_nothing_plays() {
        let mut state = AdapterState::default();
        state.apply_line(&full_line());
        assert!(state.apply_line(r#"{"type":"data","diff":false,"payload":{}}"#));
        assert_eq!(state.snapshot(), None);
    }

    #[test]
    fn other_lines_are_ignored() {
        let mut state = AdapterState::default();
        state.apply_line(&full_line());
        assert!(!state.apply_line("not json"));
        assert!(!state.apply_line(r#"{"type":"log","payload":{}}"#));
        assert!(state.snapshot().is_some());
    }

    #[test]
    fn web_players_carry_their_parent_app() {
        let mut state = AdapterState::default();
        state.apply_line(
            r#"{"type":"data","diff":false,"payload":{"bundleIdentifier":"com.apple.WebKit.GPU","parentApplicationBundleIdentifier":"com.apple.Safari","processIdentifier":901,"playing":true,"title":"Video"}}"#,
        );
        let snapshot = state.snapshot().unwrap();
        assert_eq!(
            snapshot.player.parent_app_id.as_deref(),
            Some("com.apple.Safari")
        );
        assert_eq!(snapshot.position, None);
        assert_eq!(snapshot.position_at, None);
    }

    #[test]
    fn bad_artwork_is_dropped() {
        assert_eq!(decode_artwork("!!!", "image/png"), None);
        let text = base64::engine::general_purpose::STANDARD.encode(b"hello");
        assert_eq!(decode_artwork(&text, ""), None);
        assert_eq!(
            decode_artwork(&text, "image/jpeg").unwrap().mime,
            "image/jpeg"
        );
    }

    #[test]
    fn status_scripts_ask_each_player_its_own_way() {
        let music = ScriptPlayer::Music.status_script();
        assert!(music.contains(r#"tell application id "com.apple.Music""#));
        assert!(music.contains("persistent ID of t"));
        assert!(music.contains("(duration of t) * 1000"));
        let spotify = ScriptPlayer::Spotify.status_script();
        assert!(spotify.contains(r#"tell application id "com.spotify.client""#));
        assert!(spotify.contains("{id of t,"));
        assert!(spotify.contains("artwork url of t"));
    }

    fn script_line(fields: &[&str]) -> String {
        fields.join(&FIELD_SEPARATOR.to_string()) + "\n"
    }

    #[test]
    fn the_fallback_runs_whenever_the_adapter_is_gone() {
        for sound_for in [None, Some(secs(0)), Some(secs(10))] {
            assert!(fallback_wanted(
                AdapterHealth::Gone,
                secs(0),
                sound_for,
                false
            ));
        }
    }

    #[test]
    fn the_fallback_never_runs_while_the_adapter_reports() {
        assert!(!fallback_wanted(
            AdapterHealth::Reporting,
            secs(60),
            Some(secs(60)),
            false
        ));
        assert!(!fallback_wanted(
            AdapterHealth::Reporting,
            secs(60),
            Some(secs(60)),
            true
        ));
    }

    #[test]
    fn a_silent_adapter_gets_time_to_report_first() {
        let silent = AdapterHealth::Silent;
        // Just started: wait even though the player makes sound.
        assert!(!fallback_wanted(silent, secs(1), Some(secs(10)), false));
        // Sound only just began: wait.
        assert!(!fallback_wanted(silent, secs(60), Some(secs(1)), false));
        // Nothing makes sound (Music open and idle): never ask.
        assert!(!fallback_wanted(silent, secs(60), None, false));
        // Making sound for a while with nothing reported: the adapter is
        // broken, ask.
        assert!(fallback_wanted(silent, secs(3), Some(secs(3)), false));
        // Once asking, keep asking while it is silent, sound or not.
        assert!(fallback_wanted(silent, secs(60), None, true));
    }

    #[test]
    fn sound_counts_for_an_app_and_its_helpers() {
        let playing = [
            "com.apple.Music".to_owned(),
            "com.spotify.client.helper".to_owned(),
        ];
        assert!(makes_sound("com.apple.Music", &playing));
        assert!(makes_sound("com.spotify.client", &playing));
        assert!(!makes_sound("com.spotify", &["com.spotifyx".to_owned()]));
        assert!(!makes_sound("com.apple.Music", &[]));
    }

    #[test]
    fn script_output_parses() {
        let status = parse_script_output(&script_line(&[
            "playing",
            "ABCD1234",
            "So What",
            "Miles Davis",
            "Kind of Blue",
            "",
            "1",
            "5",
            "Jazz",
            "",
            "562000",
            "12500",
        ]))
        .unwrap();
        assert_eq!(status.state, PlaybackState::Playing);
        assert_eq!(status.track.id.as_deref(), Some("ABCD1234"));
        assert_eq!(status.track.title.as_deref(), Some("So What"));
        assert_eq!(status.track.album_artist, None);
        assert_eq!(status.track.track_number, Some(1));
        assert_eq!(status.track.track_count, Some(5));
        assert_eq!(status.track.duration, Some(secs(562)));
        assert_eq!(status.position, Some(Duration::from_millis(12_500)));
        assert_eq!(status.artwork_url, None);

        let spotify = parse_script_output(&script_line(&[
            "paused",
            "spotify:track:1",
            "Song",
            "Artist",
            "Album",
            "Artist",
            "0",
            "",
            "",
            "https://i.scdn.co/image/ab67",
            "",
            "",
        ]))
        .unwrap();
        assert_eq!(spotify.state, PlaybackState::Paused);
        assert_eq!(spotify.track.track_number, None);
        assert_eq!(spotify.track.duration, None);
        assert_eq!(spotify.position, None);
        assert_eq!(
            spotify.artwork_url.as_deref(),
            Some("https://i.scdn.co/image/ab67")
        );
    }

    #[test]
    fn stopped_or_odd_script_output_is_nothing() {
        assert_eq!(parse_script_output("stopped\n"), None);
        assert_eq!(parse_script_output(""), None);
        assert_eq!(parse_script_output(&script_line(&["playing", "x"])), None);
        let mut fields = vec![""; 12];
        fields[0] = "buffering";
        assert_eq!(parse_script_output(&script_line(&fields)), None);
    }

    #[test]
    fn script_data_parses_from_hex() {
        assert_eq!(
            parse_script_data("«data PNGf89504E47»\n"),
            Some(vec![0x89, 0x50, 0x4E, 0x47])
        );
        assert_eq!(parse_script_data("«data JPEGFFD8F»"), None);
        assert_eq!(parse_script_data("«data JPEGZZ»"), None);
        assert_eq!(parse_script_data("missing value"), None);
    }

    fn player(app_id: &str, pid: Option<u32>, parent: Option<&str>) -> PlayerId {
        PlayerId {
            app_id: app_id.into(),
            pid,
            parent_app_id: parent.map(Into::into),
        }
    }

    #[test]
    fn players_belong_to_their_app() {
        let parents = HashMap::from([(900, 500), (500, 1), (812, 1)]);
        let parent_of = |p| parents.get(&p).copied();
        let spotify = player("com.spotify.client", Some(812), None);
        assert!(owns(&spotify, 1234, Some("com.spotify.client"), parent_of));
        assert!(owns(&spotify, 1234, Some("COM.SPOTIFY.CLIENT"), parent_of));
        assert!(owns(&spotify, 812, None, parent_of));
        assert!(!owns(&spotify, 1234, Some("com.apple.Music"), parent_of));
        let web = player("com.apple.WebKit.GPU", Some(901), Some("com.apple.Safari"));
        assert!(owns(&web, 77, Some("com.apple.Safari"), parent_of));
        let helper = player("com.google.Chrome.helper", Some(900), None);
        assert!(owns(&helper, 500, Some("com.google.Chrome"), parent_of));
        assert!(!owns(&helper, 812, None, parent_of));
        // Everyone descends from launchd; that is no match.
        assert!(!owns(&helper, 1, None, parent_of));
        assert!(!owns(&player("x", None, None), 500, Some(""), parent_of));
    }

    fn snapshot(title: &str, state: PlaybackState, position: u64, position_at: u64) -> Snapshot {
        Snapshot {
            player: player("com.apple.Music", Some(812), None),
            track: Some(Track {
                title: Some(title.into()),
                ..Track::default()
            }),
            state,
            position: Some(secs(position)),
            position_at: Some(at(position_at)),
            is_current: true,
        }
    }

    fn kinds(events: &[BackendEvent]) -> Vec<&'static str> {
        events
            .iter()
            .map(|e| match e {
                BackendEvent::Updated(_) => "updated",
                BackendEvent::Removed(_) => "removed",
                BackendEvent::Seeked { .. } => "seeked",
            })
            .collect()
    }

    #[test]
    fn steady_progress_reports_nothing_new() {
        let mut reporter = Reporter::default();
        let playing = PlaybackState::Playing;
        assert_eq!(
            kinds(&reporter.update(snapshot("A", playing, 10, 100), at(100))),
            ["updated"]
        );
        assert!(
            reporter
                .update(snapshot("A", playing, 15, 105), at(105))
                .is_empty()
        );
        assert_eq!(
            kinds(&reporter.update(snapshot("A", PlaybackState::Paused, 20, 110), at(110))),
            ["updated"]
        );
        // Paused: the position stays put.
        assert!(
            reporter
                .update(snapshot("A", PlaybackState::Paused, 20, 120), at(120))
                .is_empty()
        );
    }

    #[test]
    fn jumps_within_a_track_are_seeks() {
        let mut reporter = Reporter::default();
        let playing = PlaybackState::Playing;
        reporter.update(snapshot("A", playing, 10, 100), at(100));
        let events = reporter.update(snapshot("A", playing, 60, 105), at(105));
        assert_eq!(kinds(&events), ["seeked"]);
        let BackendEvent::Seeked {
            position, at: when, ..
        } = &events[0]
        else {
            unreachable!()
        };
        assert_eq!((*position, *when), (secs(60), at(105)));
    }

    #[test]
    fn pauses_without_a_new_reading_are_not_seeks() {
        let mut reporter = Reporter::default();
        reporter.update(snapshot("A", PlaybackState::Playing, 0, 100), at(100));
        // Paused at 105 but still reporting 0:00 at 100.
        let events = reporter.update(snapshot("A", PlaybackState::Paused, 0, 100), at(105));
        let [BackendEvent::Updated(paused)] = &events[..] else {
            panic!("{events:?}")
        };
        assert_eq!(
            (paused.position, paused.position_at),
            (Some(secs(5)), Some(at(105)))
        );
        // Resumed at 108 with a fresh reading of 0:05.
        let events = reporter.update(snapshot("A", PlaybackState::Playing, 5, 108), at(108));
        assert_eq!(kinds(&events), ["updated"]);
    }

    #[test]
    fn new_tracks_are_updates_not_seeks() {
        let mut reporter = Reporter::default();
        let playing = PlaybackState::Playing;
        reporter.update(snapshot("A", playing, 100, 100), at(100));
        assert_eq!(
            kinds(&reporter.update(snapshot("B", playing, 100, 101), at(101))),
            ["updated"]
        );
        // The new track's position resets just after its title arrived.
        assert!(
            reporter
                .update(
                    snapshot("B", playing, 0, 101),
                    at(101) + Duration::from_millis(300)
                )
                .is_empty()
        );
        assert!(
            reporter
                .update(snapshot("B", playing, 5, 106), at(106))
                .is_empty()
        );
    }

    #[test]
    fn players_are_removed_once() {
        let mut reporter = Reporter::default();
        let music = snapshot("A", PlaybackState::Playing, 0, 100);
        let id = music.player.clone();
        reporter.update(music, at(100));
        assert!(reporter.last(&id).is_some());
        assert_eq!(reporter.retain(|_| true), []);
        assert_eq!(
            reporter.retain(|_| false),
            [BackendEvent::Removed(id.clone())]
        );
        assert_eq!(reporter.remove(&id), None);
    }
}

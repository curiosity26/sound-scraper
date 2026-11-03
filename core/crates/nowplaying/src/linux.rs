//! MPRIS 2 over the D-Bus session bus.
//!
//! Every MPRIS player owns a bus name under `org.mpris.MediaPlayer2.` and
//! serves `org.mpris.MediaPlayer2.Player` at `/org/mpris/MediaPlayer2`. We
//! watch three signals: `NameOwnerChanged` (players coming and going),
//! `PropertiesChanged` (new track, play/pause) and `Seeked`. `Position` is
//! never signalled, so it is read whenever a snapshot is built.
//!
//! Two threads per started backend: a reader that only drains the
//! connection's message stream into a channel, and a worker that makes the
//! method calls. Keeping them apart matters because zbus's stream has a
//! bounded queue; a single thread blocked in a method call while signals pile
//! up could stall the socket reader that would deliver its own reply.

use std::{
    collections::HashMap,
    ffi::OsString,
    fs::File,
    io::Read,
    num::NonZeroUsize,
    os::unix::ffi::OsStringExt,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, Sender},
    },
    thread::JoinHandle,
    time::{Duration, SystemTime},
};

use zbus::{
    Connection, MatchRule, MessageStream, OwnedVariant, Variant, block_on, connection,
    export::futures_core::Stream,
    fdo::DBusProxy,
    message::{Message, Type as MessageType},
    names::BusName,
};

use crate::{
    Artwork, BackendEvent, NowPlayingBackend, NowPlayingError, PlaybackState, PlayerId, Snapshot,
    Track,
};

const BUS_PREFIX: &str = "org.mpris.MediaPlayer2.";
const OBJECT_PATH: &str = "/org/mpris/MediaPlayer2";
const PLAYER_IFACE: &str = "org.mpris.MediaPlayer2.Player";
const PROPERTIES_IFACE: &str = "org.freedesktop.DBus.Properties";
const DBUS_IFACE: &str = "org.freedesktop.DBus";
/// Our private wake-up signal, sent to ourselves so `stop` can unblock the
/// reader thread, which otherwise sleeps until the bus says something.
const WAKE_IFACE: &str = "app.soundscraper.NowPlaying";
const WAKE_MEMBER: &str = "Wake";

/// A hung player must not freeze the worker (and so `stop`) for zbus's
/// default 25 s; MPRIS calls are cheap property reads.
const METHOD_TIMEOUT: Duration = Duration::from_secs(2);
/// Bigger than zbus's default 64 so a burst of signals during startup never
/// back-pressures the socket; the reader drains it immediately anyway.
const MAX_QUEUED: NonZeroUsize = NonZeroUsize::new(1024).unwrap();
/// Players hand out whatever image they like; anything bigger is not cover
/// art worth embedding.
const MAX_ART_BYTES: u64 = 10 * 1024 * 1024;
/// The spec's `mpris:trackid` for "no track".
const NO_TRACK: &str = "/org/mpris/MediaPlayer2/TrackList/NoTrack";
/// Bounds the `/proc` parent walk in `owns` (and survives a pid-reuse loop).
const MAX_PROC_DEPTH: usize = 32;

pub struct Mpris {
    running: Option<Running>,
}

struct Running {
    shutdown: Arc<Shutdown>,
    reader: JoinHandle<()>,
    worker: JoinHandle<()>,
}

/// Shared by both threads and `stop`: whoever decides to end (stop, a closed
/// sink, a dead bus) flips the flag and wakes the reader.
struct Shutdown {
    flag: AtomicBool,
    conn: Connection,
}

impl Shutdown {
    fn is_set(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    fn trigger(&self) {
        if self.flag.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(me) = self.conn.unique_name() {
            // If this fails the bus is gone, and the reader's stream ends on
            // its own.
            let _ = block_on(self.conn.emit_signal(
                Some(me.as_str()),
                OBJECT_PATH,
                WAKE_IFACE,
                WAKE_MEMBER,
                &(),
            ));
        }
    }
}

impl Mpris {
    pub fn new() -> Self {
        Self { running: None }
    }
}

impl Default for Mpris {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Mpris {
    fn drop(&mut self) {
        self.stop();
    }
}

impl NowPlayingBackend for Mpris {
    /// Connects here rather than on the thread so a missing session bus is
    /// reported to the caller as `Unavailable`.
    fn start(&mut self, sink: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        self.stop();
        let conn = block_on(
            connection::Builder::session()
                .method_timeout(METHOD_TIMEOUT)
                .max_queued(MAX_QUEUED)
                .build(),
        )
        .map_err(|e| NowPlayingError::Unavailable(format!("D-Bus session bus: {e}")))?;
        // Subscribe before adding match rules so nothing between the two is
        // lost.
        let messages = MessageStream::from(&conn);
        block_on(add_match_rules(&conn))
            .map_err(|e| NowPlayingError::Os(format!("D-Bus AddMatch: {e}")))?;

        let shutdown = Arc::new(Shutdown {
            flag: AtomicBool::new(false),
            conn: conn.clone(),
        });
        let (tx, rx) = mpsc::channel();
        let reader = spawn("mpris-reader", {
            let shutdown = shutdown.clone();
            move || read_messages(messages, tx, &shutdown)
        })?;
        let worker = spawn("mpris-worker", {
            let shutdown = shutdown.clone();
            move || Worker::new(conn, sink, shutdown).run(rx)
        });
        let worker = match worker {
            Ok(worker) => worker,
            Err(e) => {
                shutdown.trigger();
                let _ = reader.join();
                return Err(e);
            }
        };
        self.running = Some(Running {
            shutdown,
            reader,
            worker,
        });
        Ok(())
    }

    fn stop(&mut self) {
        if let Some(running) = self.running.take() {
            running.shutdown.trigger();
            let _ = running.reader.join();
            let _ = running.worker.join();
        }
    }

    /// The captured app usually is the player itself (PipeWire capture
    /// targets the browser main process, which is also the one exposing the
    /// MPRIS name); a helper process the app spawned counts too.
    fn owns(&self, player: &PlayerId, pid: u32, _: Option<&str>) -> bool {
        player
            .pid
            .is_some_and(|player_pid| is_same_or_descendant(player_pid, pid))
    }
}

fn spawn(name: &str, f: impl FnOnce() + Send + 'static) -> Result<JoinHandle<()>, NowPlayingError> {
    std::thread::Builder::new()
        .name(name.into())
        .spawn(f)
        .map_err(|e| NowPlayingError::Os(format!("spawning {name}: {e}")))
}

/// The stream's next message; zbus 6 is async only, and this crate drives
/// it from plain threads with `zbus::block_on`.
async fn next(messages: &mut MessageStream) -> Option<zbus::Result<Message>> {
    std::future::poll_fn(|cx| std::pin::Pin::new(&mut *messages).poll_next(cx)).await
}

async fn add_match_rules(conn: &Connection) -> zbus::Result<()> {
    let dbus = DBusProxy::new(conn).await?;
    let name_owner = MatchRule::builder()
        .msg_type(MessageType::Signal)
        .sender(DBUS_IFACE)
        .interface(DBUS_IFACE)
        .member("NameOwnerChanged")
        .arg0ns("org.mpris.MediaPlayer2")
        .build()?;
    let properties = MatchRule::builder()
        .msg_type(MessageType::Signal)
        .interface(PROPERTIES_IFACE)
        .member("PropertiesChanged")
        .path(OBJECT_PATH)
        .arg(0, PLAYER_IFACE)
        .build()?;
    let seeked = MatchRule::builder()
        .msg_type(MessageType::Signal)
        .interface(PLAYER_IFACE)
        .member("Seeked")
        .path(OBJECT_PATH)
        .build()?;
    for rule in [name_owner, properties, seeked] {
        dbus.add_match_rule(rule).await?;
    }
    Ok(())
}

/// Forwards every incoming signal to the worker until shut down.
fn read_messages(mut messages: MessageStream, tx: Sender<Message>, shutdown: &Shutdown) {
    while let Some(msg) = block_on(next(&mut messages)) {
        if shutdown.is_set() {
            break;
        }
        let Ok(msg) = msg else { continue };
        if msg.header().message_type() == MessageType::Signal && tx.send(msg).is_err() {
            break;
        }
    }
    // The stream also ends when the bus goes away: make the worker stop too.
    shutdown.trigger();
}

/// One player we have seen.
struct Player {
    id: PlayerId,
    /// The unique name (`:1.42`) that signals come from.
    owner: String,
    /// The last `mpris:artUrl` and what it loaded to, so a play/pause does
    /// not reread the file.
    art: Option<(String, Option<Artwork>)>,
}

struct Worker {
    conn: Connection,
    sink: Sender<BackendEvent>,
    shutdown: Arc<Shutdown>,
    /// By well-known bus name.
    players: HashMap<String, Player>,
}

impl Worker {
    fn new(conn: Connection, sink: Sender<BackendEvent>, shutdown: Arc<Shutdown>) -> Self {
        Self {
            conn,
            sink,
            shutdown,
            players: HashMap::new(),
        }
    }

    fn run(mut self, rx: Receiver<Message>) {
        self.add_existing_players();
        while let Ok(msg) = rx.recv() {
            if self.shutdown.is_set() {
                break;
            }
            self.handle(&msg);
        }
        self.shutdown.trigger();
    }

    /// Reports to the sink unless stopping; a dropped receiver stops us.
    fn send(&self, event: BackendEvent) {
        if !self.shutdown.is_set() && self.sink.send(event).is_err() {
            self.shutdown.trigger();
        }
    }

    fn add_existing_players(&mut self) {
        let Ok(dbus) = block_on(DBusProxy::new(&self.conn)) else {
            return;
        };
        let Ok(names) = block_on(dbus.list_names()) else {
            return;
        };
        for name in names {
            if !is_player_name(name.as_str()) {
                continue;
            }
            let Ok(owner) = block_on(dbus.get_name_owner(name.inner().clone())) else {
                continue;
            };
            self.add_player(name.as_str(), owner.as_str());
        }
    }

    fn handle(&mut self, msg: &Message) {
        let header = msg.header();
        let (Some(iface), Some(member)) = (header.interface(), header.member()) else {
            return;
        };
        let sender = header.sender().map(|s| s.as_str()).unwrap_or_default();
        match (iface.as_str(), member.as_str()) {
            (DBUS_IFACE, "NameOwnerChanged") => {
                if let Ok((name, old, new)) = msg.body().deserialize::<(String, String, String)>() {
                    self.name_owner_changed(&name, &old, &new);
                }
            }
            (PROPERTIES_IFACE, "PropertiesChanged") => {
                type Body = (String, HashMap<String, OwnedVariant>, Vec<String>);
                if let Ok((iface, changed, invalidated)) = msg.body().deserialize::<Body>()
                    && iface == PLAYER_IFACE
                    && touches_snapshot(changed.keys().chain(&invalidated))
                {
                    self.refresh_owner(sender);
                }
            }
            (PLAYER_IFACE, "Seeked") => {
                if let Ok(micros) = msg.body().deserialize::<i64>() {
                    self.seeked(sender, micros);
                }
            }
            _ => {}
        }
    }

    fn name_owner_changed(&mut self, name: &str, old: &str, new: &str) {
        if !is_player_name(name) {
            return;
        }
        if !old.is_empty()
            && let Some(player) = self.players.remove(name)
        {
            self.send(BackendEvent::Removed(player.id));
        }
        if !new.is_empty() {
            self.add_player(name, new);
        }
    }

    fn add_player(&mut self, name: &str, owner: &str) {
        let pid = block_on(async {
            let dbus = DBusProxy::new(&self.conn).await?;
            let owner = BusName::try_from(owner)?;
            dbus.get_connection_unix_process_id(owner)
                .await
                .map_err(zbus::Error::from)
        })
        .ok();
        let player = Player {
            id: PlayerId {
                app_id: name.to_owned(),
                pid,
                parent_app_id: None,
            },
            owner: owner.to_owned(),
            art: None,
        };
        self.players.insert(name.to_owned(), player);
        self.refresh(name);
    }

    /// Re-reports every player behind `owner` (normally one).
    fn refresh_owner(&mut self, owner: &str) {
        let names: Vec<String> = self
            .players
            .iter()
            .filter(|(_, p)| p.owner == owner)
            .map(|(name, _)| name.clone())
            .collect();
        for name in names {
            self.refresh(&name);
        }
    }

    /// Reads the player's state and reports it; a player that does not
    /// answer sensibly is skipped until its next signal.
    fn refresh(&mut self, name: &str) {
        let Some(player) = self.players.get_mut(name) else {
            return;
        };
        let Some(props) = get_player_properties(&self.conn, &player.owner) else {
            return;
        };
        let position_at = SystemTime::now();
        let metadata = props
            .get("Metadata")
            .and_then(|v| HashMap::<String, OwnedVariant>::try_from(v.try_clone().ok()?).ok())
            .unwrap_or_default();
        let mut track = track_from_metadata(&metadata);
        if let Some(track) = &mut track {
            track.artwork = cached_artwork(&mut player.art, art_url(&metadata));
        }
        let position = props.get("Position").and_then(|v| micros(v));
        let snapshot = Snapshot {
            player: player.id.clone(),
            track,
            state: props
                .get("PlaybackStatus")
                .and_then(|v| string(v))
                .map_or(PlaybackState::Stopped, |s| playback_state(&s)),
            position,
            position_at: position.map(|_| position_at),
            is_current: false,
        };
        self.send(BackendEvent::Updated(Box::new(snapshot)));
    }

    fn seeked(&self, owner: &str, micros: i64) {
        let Ok(micros) = u64::try_from(micros) else {
            return;
        };
        let at = SystemTime::now();
        for player in self.players.values().filter(|p| p.owner == owner) {
            self.send(BackendEvent::Seeked {
                player: player.id.clone(),
                position: Duration::from_micros(micros),
                at,
            });
        }
    }
}

fn is_player_name(name: &str) -> bool {
    name.strip_prefix(BUS_PREFIX)
        .is_some_and(|rest| !rest.is_empty())
}

/// Volume, rate and the like change often and mean nothing to us.
fn touches_snapshot<'a>(mut names: impl Iterator<Item = &'a String>) -> bool {
    names.any(|n| n == "Metadata" || n == "PlaybackStatus")
}

fn get_player_properties(conn: &Connection, owner: &str) -> Option<HashMap<String, OwnedVariant>> {
    let reply = block_on(conn.call_method(
        Some(owner),
        OBJECT_PATH,
        Some(PROPERTIES_IFACE),
        "GetAll",
        &(PLAYER_IFACE,),
    ))
    .ok()?;
    reply.body().deserialize().ok()
}

fn playback_state(status: &str) -> PlaybackState {
    match status {
        "Playing" => PlaybackState::Playing,
        "Paused" => PlaybackState::Paused,
        _ => PlaybackState::Stopped,
    }
}

/// Maps an MPRIS `Metadata` dictionary to a [`Track`], without artwork
/// (that needs I/O, see [`art_url`]). `None` when the player says nothing
/// useful, as players do between tracks.
pub(crate) fn track_from_metadata(metadata: &HashMap<String, OwnedVariant>) -> Option<Track> {
    let get = |key: &str| metadata.get(key).map(|v| &**v);
    let track = Track {
        title: get("xesam:title").and_then(string),
        artist: get("xesam:artist").and_then(joined),
        album: get("xesam:album").and_then(string),
        album_artist: get("xesam:albumArtist").and_then(joined),
        track_number: get("xesam:trackNumber")
            .and_then(integer)
            .and_then(|n| u32::try_from(n).ok())
            .filter(|&n| n > 0),
        track_count: None,
        genre: get("xesam:genre").and_then(joined),
        duration: get("mpris:length").and_then(micros),
        artwork: None,
        id: get("mpris:trackid")
            .and_then(string)
            .filter(|id| id != NO_TRACK),
    };
    (track != Track::default()).then_some(track)
}

/// `mpris:artUrl`, if the player gave one.
pub(crate) fn art_url(metadata: &HashMap<String, OwnedVariant>) -> Option<String> {
    metadata.get("mpris:artUrl").and_then(|v| string(v))
}

fn cached_artwork(
    cache: &mut Option<(String, Option<Artwork>)>,
    url: Option<String>,
) -> Option<Artwork> {
    let url = url?;
    match cache {
        Some((cached, art)) if *cached == url => art.clone(),
        _ => {
            let art = load_artwork(&url);
            *cache = Some((url, art.clone()));
            art
        }
    }
}

/// Only `file://` art is loaded. `http(s)://` (Spotify, browsers) would
/// need an HTTP client, which this crate deliberately doesn't have yet.
fn load_artwork(url: &str) -> Option<Artwork> {
    let path = file_url_path(url)?;
    let file = File::open(path).ok()?;
    if file.metadata().ok()?.len() > MAX_ART_BYTES {
        return None;
    }
    let mut data = Vec::new();
    // `take` guards against a file that grew after the size check.
    file.take(MAX_ART_BYTES + 1).read_to_end(&mut data).ok()?;
    if data.len() as u64 > MAX_ART_BYTES {
        return None;
    }
    let mime = sniff_image_mime(&data)?;
    Some(Artwork {
        mime: mime.into(),
        data: data.into(),
    })
}

/// The local path of a `file://` URL (`file:///p` or `file://localhost/p`),
/// percent-decoded.
pub(crate) fn file_url_path(url: &str) -> Option<PathBuf> {
    let rest = url.strip_prefix("file://")?;
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    if !rest.starts_with('/') {
        return None;
    }
    let bytes = percent_decode(rest)?;
    Some(OsString::from_vec(bytes).into())
}

/// Decodes `%XX` escapes; `None` on a malformed escape.
fn percent_decode(s: &str) -> Option<Vec<u8>> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    Some(out)
}

/// Trusts the bytes, not the URL's extension: players write art to
/// extensionless cache files.
pub(crate) fn sniff_image_mime(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some("image/png")
    } else {
        None
    }
}

/// Some players wrap values in an extra variant; look through it.
fn unwrap_variant<'a>(mut value: &'a Variant<'a>) -> &'a Variant<'a> {
    while let Variant::Variant(inner) = value {
        value = inner;
    }
    value
}

/// A non-empty string (object paths included, for `mpris:trackid`).
fn string(value: &Variant<'_>) -> Option<String> {
    let s = match unwrap_variant(value) {
        Variant::Str(s) => s.as_str(),
        Variant::ObjectPath(p) => p.as_str(),
        _ => return None,
    };
    (!s.is_empty()).then(|| s.to_owned())
}

/// A string, or an array of strings joined with ", " (the spec says arrays
/// for artists and genres; some players send a plain string anyway).
fn joined(value: &Variant<'_>) -> Option<String> {
    match unwrap_variant(value) {
        Variant::Array(items) => {
            let parts: Vec<String> = items.iter().filter_map(string).collect();
            (!parts.is_empty()).then(|| parts.join(", "))
        }
        other => string(other),
    }
}

/// Any integer type: the spec says `i32`/`i64`, players send what they like.
fn integer(value: &Variant<'_>) -> Option<i64> {
    match *unwrap_variant(value) {
        Variant::U8(n) => Some(n.into()),
        Variant::I16(n) => Some(n.into()),
        Variant::U16(n) => Some(n.into()),
        Variant::I32(n) => Some(n.into()),
        Variant::U32(n) => Some(n.into()),
        Variant::I64(n) => Some(n),
        Variant::U64(n) => i64::try_from(n).ok(),
        _ => None,
    }
}

/// A non-negative microsecond count (`mpris:length`, `Position`).
fn micros(value: &Variant<'_>) -> Option<Duration> {
    let n = integer(value)?;
    u64::try_from(n).ok().map(Duration::from_micros)
}

/// Whether `pid` is `ancestor` or one of its descendants.
fn is_same_or_descendant(pid: u32, ancestor: u32) -> bool {
    let mut current = pid;
    for _ in 0..MAX_PROC_DEPTH {
        if current == ancestor {
            return true;
        }
        match parent_pid(current) {
            Some(parent) if parent != 0 && parent != current => current = parent,
            _ => return false,
        }
    }
    false
}

fn parent_pid(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    ppid_from_stat(&stat)
}

/// `/proc/<pid>/stat` is `pid (comm) state ppid ...`; `comm` may contain
/// spaces and parentheses, so parse after the last `)`.
pub(crate) fn ppid_from_stat(stat: &str) -> Option<u32> {
    let (_, rest) = stat.rsplit_once(')')?;
    let mut fields = rest.split_whitespace();
    let _state = fields.next()?;
    fields.next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use zbus::ObjectPath;

    fn owned(value: Variant<'_>) -> OwnedVariant {
        value.try_to_owned().expect("no fds")
    }

    fn metadata(entries: Vec<(&str, Variant<'_>)>) -> HashMap<String, OwnedVariant> {
        entries
            .into_iter()
            .map(|(k, v)| (k.to_owned(), owned(v)))
            .collect()
    }

    #[test]
    fn maps_full_metadata() {
        let md = metadata(vec![
            ("xesam:title", Variant::from("Song")),
            ("xesam:artist", Variant::from(vec!["A", "B"])),
            ("xesam:album", Variant::from("Album")),
            ("xesam:albumArtist", Variant::from(vec!["Various"])),
            ("xesam:trackNumber", Variant::I32(7)),
            ("xesam:genre", Variant::from(vec!["Rock", "Pop"])),
            ("mpris:length", Variant::I64(215_500_000)),
            (
                "mpris:trackid",
                Variant::ObjectPath(ObjectPath::from_static_str_unchecked("/org/x/track/1")),
            ),
        ]);
        let track = track_from_metadata(&md).unwrap();
        assert_eq!(
            track,
            Track {
                title: Some("Song".into()),
                artist: Some("A, B".into()),
                album: Some("Album".into()),
                album_artist: Some("Various".into()),
                track_number: Some(7),
                track_count: None,
                genre: Some("Rock, Pop".into()),
                duration: Some(Duration::from_millis(215_500)),
                artwork: None,
                id: Some("/org/x/track/1".into()),
            }
        );
    }

    #[test]
    fn tolerates_odd_types() {
        let md = metadata(vec![
            (
                "xesam:title",
                Variant::Variant(Box::new(Variant::from("Wrapped"))),
            ),
            ("xesam:artist", Variant::from("Plain String")),
            ("mpris:length", Variant::U64(1_000_000)),
            ("mpris:trackid", Variant::from("spotify:track:abc")),
            ("xesam:trackNumber", Variant::from("not a number")),
            ("xesam:album", Variant::I32(3)),
        ]);
        let track = track_from_metadata(&md).unwrap();
        assert_eq!(track.title.as_deref(), Some("Wrapped"));
        assert_eq!(track.artist.as_deref(), Some("Plain String"));
        assert_eq!(track.duration, Some(Duration::from_secs(1)));
        assert_eq!(track.id.as_deref(), Some("spotify:track:abc"));
        assert_eq!(track.track_number, None);
        assert_eq!(track.album, None);
    }

    #[test]
    fn empty_values_are_missing() {
        let md = metadata(vec![
            ("xesam:album", Variant::from("Kept")),
            ("xesam:title", Variant::from("")),
            ("xesam:artist", Variant::from(vec![""])),
            ("xesam:trackNumber", Variant::I32(0)),
            ("mpris:length", Variant::I64(-5)),
            (
                "mpris:trackid",
                Variant::ObjectPath(ObjectPath::from_static_str_unchecked(NO_TRACK)),
            ),
        ]);
        let track = track_from_metadata(&md).unwrap();
        assert_eq!(track.title, None);
        assert_eq!(track.artist, None);
        assert_eq!(track.track_number, None);
        assert_eq!(track.duration, None);
        assert_eq!(track.id, None);

        assert_eq!(track_from_metadata(&HashMap::new()), None);
        let blank = metadata(vec![("xesam:title", Variant::from(""))]);
        assert_eq!(track_from_metadata(&blank), None);
    }

    #[test]
    fn sniffs_mime() {
        assert_eq!(
            sniff_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0, 0]),
            Some("image/jpeg")
        );
        assert_eq!(sniff_image_mime(b"\x89PNG\r\n\x1a\n"), Some("image/png"));
        assert_eq!(sniff_image_mime(b"GIF89a"), None);
        assert_eq!(sniff_image_mime(&[0xFF, 0xD8]), None);
        assert_eq!(sniff_image_mime(&[]), None);
    }

    #[test]
    fn parses_file_urls() {
        assert_eq!(
            file_url_path("file:///tmp/My%20Art.png"),
            Some(PathBuf::from("/tmp/My Art.png"))
        );
        assert_eq!(
            file_url_path("file://localhost/a/b"),
            Some(PathBuf::from("/a/b"))
        );
        assert_eq!(file_url_path("file:///bad%zz"), None);
        assert_eq!(file_url_path("file:///trunc%2"), None);
        assert_eq!(file_url_path("https://example.com/a.jpg"), None);
        assert_eq!(file_url_path("file://otherhost/a"), None);
    }

    #[test]
    fn loads_file_art_and_skips_unknown() {
        let dir = std::env::temp_dir().join(format!("nowplaying-art-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("cover art");
        std::fs::write(&png, b"\x89PNG\r\n\x1a\nrest").unwrap();
        let gif = dir.join("cover.gif");
        std::fs::write(&gif, b"GIF89a....").unwrap();

        let url = format!("file://{}", png.display()).replace(' ', "%20");
        let art = load_artwork(&url).unwrap();
        assert_eq!(art.mime, "image/png");
        assert_eq!(&*art.data, b"\x89PNG\r\n\x1a\nrest");
        assert_eq!(load_artwork(&format!("file://{}", gif.display())), None);
        assert_eq!(load_artwork("https://example.com/cover.jpg"), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_proc_stat() {
        assert_eq!(ppid_from_stat("1234 (bash) S 1000 1234 ..."), Some(1000));
        assert_eq!(
            ppid_from_stat("99 (Web Content (x)) R 42 99 99 0"),
            Some(42)
        );
        assert_eq!(ppid_from_stat("garbage"), None);
    }

    #[test]
    fn owns_self_and_children_of_ancestors() {
        let me = std::process::id();
        let backend = Mpris::new();
        let player = |pid| PlayerId {
            app_id: "org.mpris.MediaPlayer2.test".into(),
            pid,
            parent_app_id: None,
        };
        assert!(backend.owns(&player(Some(me)), me, None));
        // We are a descendant of our parent...
        if let Some(parent) = parent_pid(me) {
            assert!(backend.owns(&player(Some(me)), parent, None));
            // ...but our parent is not ours.
            assert!(!backend.owns(&player(Some(parent)), me, None));
        }
        assert!(!backend.owns(&player(None), me, None));
    }

    #[test]
    fn recognises_player_names() {
        assert!(is_player_name("org.mpris.MediaPlayer2.vlc"));
        assert!(is_player_name(
            "org.mpris.MediaPlayer2.firefox.instance_1_2"
        ));
        assert!(!is_player_name("org.mpris.MediaPlayer2."));
        assert!(!is_player_name("org.mpris.MediaPlayer2"));
        assert!(!is_player_name("org.freedesktop.DBus"));
    }
}

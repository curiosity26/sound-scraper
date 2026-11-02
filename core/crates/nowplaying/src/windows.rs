//! SMTC (Windows.Media.Control): the system media transport controls that
//! Windows players (Spotify, browsers, Media Player) feed for the volume
//! flyout and the lock screen.
//!
//! WinRT raises events on its own thread pool, so handlers only post a
//! [`Msg`] to one worker thread. The worker owns the session manager, makes
//! every WinRT call (some block on async operations), keeps per-session
//! state and talks to the sink, so nothing needs locking.

use std::{
    collections::HashMap,
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime},
};

use windows::{
    Foundation::TypedEventHandler,
    Media::Control::{
        CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProperties,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        MediaPropertiesChangedEventArgs, PlaybackInfoChangedEventArgs, SessionsChangedEventArgs,
        TimelinePropertiesChangedEventArgs,
    },
    Storage::Streams::{DataReader, IInputStream},
    Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
    core::{HSTRING, RuntimeType},
};

use crate::{
    Artwork, BackendEvent, NowPlayingBackend, NowPlayingError, PlaybackState, PlayerId, Snapshot,
    Track,
    smtc_logic::{
        MAX_ARTWORK_BYTES, Mark, Timeline, artwork_mime, aumids_equal, exe_matches_aumid,
        join_genres, non_empty, positive, process_tree, timeline,
    },
};

/// Players report a track change as separate media and timeline events in
/// either order. A position jump this close to a media change belongs to
/// the new track, not a seek, so seeks are held this long before going out.
const TRACK_CHANGE_GRACE: Duration = Duration::from_secs(1);

/// What an event handler tells the worker. Session events carry the
/// session's AUMID, captured when the handler was registered.
enum Msg {
    SessionsChanged,
    CurrentChanged,
    Media(String),
    Playback(String),
    Timeline(String),
    Stop,
}

pub struct Smtc {
    worker: Option<WorkerHandle>,
}

struct WorkerHandle {
    tx: Sender<Msg>,
    thread: JoinHandle<()>,
}

impl Smtc {
    pub fn new() -> Self {
        Self { worker: None }
    }
}

impl NowPlayingBackend for Smtc {
    /// Returns once the worker has the session manager and has reported
    /// every session already present, so startup failures surface here.
    fn start(&mut self, sink: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        self.stop();
        let (tx, rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let handler_tx = tx.clone();
        let thread = thread::Builder::new()
            .name("smtc".into())
            .spawn(move || run(rx, handler_tx, sink, ready_tx))
            .map_err(|e| NowPlayingError::Os(format!("starting SMTC thread: {e}")))?;
        let ready = ready_rx
            .recv()
            .unwrap_or_else(|_| Err(NowPlayingError::Os("SMTC thread died at startup".into())));
        match ready {
            Ok(()) => {
                self.worker = Some(WorkerHandle { tx, thread });
                Ok(())
            }
            Err(e) => {
                let _ = thread.join();
                Err(e)
            }
        }
    }

    /// The worker removes its event registrations on the way out.
    fn stop(&mut self) {
        if let Some(worker) = self.worker.take() {
            let _ = worker.tx.send(Msg::Stop);
            let _ = worker.thread.join();
        }
    }

    /// SMTC gives no PID, so this matches the session's AUMID against the
    /// captured process and its descendants (browsers play from child
    /// processes): their own AUMID for packaged apps, else their exe name
    /// (see [`exe_matches_aumid`]).
    fn owns(&self, player: &PlayerId, pid: u32, _: Option<&str>) -> bool {
        let table = process_table();
        let parents = table.iter().map(|(&p, info)| (p, info.parent)).collect();
        process_tree(pid, &parents).into_iter().any(|p| {
            table
                .get(&p)
                .is_some_and(|info| exe_matches_aumid(&player.app_id, &info.exe))
                || process_aumid(p).is_some_and(|aumid| aumids_equal(&aumid, &player.app_id))
        })
    }
}

impl Drop for Smtc {
    fn drop(&mut self) {
        self.stop();
    }
}

fn os_err(what: &str, e: windows::core::Error) -> NowPlayingError {
    NowPlayingError::Os(format!("{what}: {e}"))
}

/// The worker thread: WinRT in the multithreaded apartment, so the session
/// objects can be used from here while their events fire elsewhere.
fn run(
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
    sink: Sender<BackendEvent>,
    ready: Sender<Result<(), NowPlayingError>>,
) {
    // SAFETY: a fresh thread with no apartment yet; balanced by the
    // RoUninitialize below once every WinRT object is dropped.
    if let Err(e) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        let _ = ready.send(Err(os_err("RoInitialize", e)));
        return;
    }
    match Worker::start(tx, sink) {
        Ok(mut worker) => {
            let _ = ready.send(Ok(()));
            worker.serve(&rx);
            drop(worker);
        }
        Err(e) => {
            let _ = ready.send(Err(e));
        }
    }
    // SAFETY: pairs with the successful RoInitialize above, on this thread.
    unsafe { RoUninitialize() };
}

/// The sink, remembering when the receiver went away so the worker can
/// quit instead of reading players nobody listens to.
struct Out {
    sink: Sender<BackendEvent>,
    closed: bool,
}

impl Out {
    fn emit(&mut self, event: BackendEvent) {
        if self.sink.send(event).is_err() {
            self.closed = true;
        }
    }
}

/// Event registration tokens, kept to remove the handlers on the way out.
#[derive(Default)]
struct SessionTokens {
    media: Option<i64>,
    playback: Option<i64>,
    timeline: Option<i64>,
}

/// A seek waiting out [`TRACK_CHANGE_GRACE`].
struct PendingSeek {
    position: Duration,
    at: SystemTime,
    due: Instant,
}

struct Entry {
    session: Session,
    tokens: SessionTokens,
    /// Read on media changes only: reading the thumbnail is not free.
    track: Option<Track>,
    state: PlaybackState,
    mark: Option<Mark>,
    last_track_change: Option<Instant>,
    pending_seek: Option<PendingSeek>,
}

impl Entry {
    /// Restarts seek detection from `timeline`, when it has a position.
    fn anchor(&mut self, timeline: &Timeline) {
        if let Some(position) = timeline.position {
            self.mark = Some(Mark {
                position,
                at: timeline.position_at.unwrap_or_else(SystemTime::now),
                playing: self.state == PlaybackState::Playing,
            });
        }
    }

    fn unsubscribe(&mut self) {
        let tokens = std::mem::take(&mut self.tokens);
        if let Some(token) = tokens.media {
            let _ = self.session.RemoveMediaPropertiesChanged(token);
        }
        if let Some(token) = tokens.playback {
            let _ = self.session.RemovePlaybackInfoChanged(token);
        }
        if let Some(token) = tokens.timeline {
            let _ = self.session.RemoveTimelinePropertiesChanged(token);
        }
    }
}

struct Worker {
    manager: Manager,
    sessions_token: Option<i64>,
    current_token: Option<i64>,
    /// By AUMID. Several sessions can share one (two browser windows);
    /// `PlayerId` can't tell them apart, so the first one listed wins.
    sessions: HashMap<String, Entry>,
    current: Option<String>,
    tx: Sender<Msg>,
    out: Out,
}

impl Worker {
    /// Gets the manager, subscribes to it and reports the sessions already
    /// there.
    fn start(tx: Sender<Msg>, sink: Sender<BackendEvent>) -> Result<Self, NowPlayingError> {
        let manager = Manager::RequestAsync()
            .and_then(|op| op.join())
            .map_err(|e| NowPlayingError::Unavailable(format!("SMTC session manager: {e}")))?;
        let mut worker = Worker {
            manager,
            sessions_token: None,
            current_token: None,
            sessions: HashMap::new(),
            current: None,
            tx,
            out: Out {
                sink,
                closed: false,
            },
        };
        // Subscribe first so a change during the initial listing is not
        // lost; it just queues.
        worker.sessions_token = Some(
            worker
                .manager
                .SessionsChanged(&handler::<Manager, SessionsChangedEventArgs>(
                    &worker.tx,
                    || Msg::SessionsChanged,
                ))
                .map_err(|e| os_err("subscribing to SMTC sessions", e))?,
        );
        worker.current_token = Some(
            worker
                .manager
                .CurrentSessionChanged(&handler::<Manager, CurrentSessionChangedEventArgs>(
                    &worker.tx,
                    || Msg::CurrentChanged,
                ))
                .map_err(|e| os_err("subscribing to the current SMTC session", e))?,
        );
        worker.current = current_app_id(&worker.manager);
        worker
            .sync_sessions()
            .map_err(|e| os_err("listing SMTC sessions", e))?;
        Ok(worker)
    }

    fn serve(&mut self, rx: &Receiver<Msg>) {
        while !self.out.closed {
            let msg = match self.next_seek_due() {
                Some(due) => match rx.recv_timeout(due.saturating_duration_since(Instant::now())) {
                    Ok(msg) => msg,
                    Err(RecvTimeoutError::Timeout) => {
                        self.flush_seeks();
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => return,
                },
                None => match rx.recv() {
                    Ok(msg) => msg,
                    Err(_) => return,
                },
            };
            match msg {
                Msg::Stop => return,
                Msg::SessionsChanged => {
                    // A failed listing changes nothing; the next event retries.
                    let _ = self.sync_sessions();
                }
                Msg::CurrentChanged => self.current_changed(),
                Msg::Media(id) => self.media_changed(&id),
                Msg::Playback(id) => self.playback_changed(&id),
                Msg::Timeline(id) => self.timeline_changed(&id),
            }
        }
    }

    /// Brings `sessions` in line with the manager's list: subscribes to and
    /// reports new sessions, drops and reports gone ones.
    fn sync_sessions(&mut self) -> windows::core::Result<()> {
        let list = self.manager.GetSessions()?;
        let mut listed: Vec<(String, Session)> = Vec::new();
        for session in &list {
            if let Some(id) = app_id(&session)
                && !listed.iter().any(|(seen, _)| seen == &id)
            {
                listed.push((id, session));
            }
        }
        let gone: Vec<String> = self
            .sessions
            .keys()
            .filter(|id| !listed.iter().any(|(listed, _)| listed == *id))
            .cloned()
            .collect();
        for id in gone {
            if let Some(mut entry) = self.sessions.remove(&id) {
                entry.unsubscribe();
                self.out.emit(BackendEvent::Removed(player_id(&id)));
            }
        }
        for (id, session) in listed {
            match self.sessions.get_mut(&id) {
                Some(entry) if entry.session == session => continue,
                // Same app, new session object (the old one closed): follow
                // the live one.
                Some(entry) => entry.unsubscribe(),
                None => {}
            }
            self.add_session(id, session);
        }
        Ok(())
    }

    fn add_session(&mut self, id: String, session: Session) {
        let tokens = self.subscribe(&id, &session);
        let mut entry = Entry {
            track: read_track(&session),
            state: read_state(&session),
            session,
            tokens,
            mark: None,
            last_track_change: None,
            pending_seek: None,
        };
        let timeline = read_timeline(&entry.session);
        entry.anchor(&timeline);
        let snapshot = build_snapshot(&id, &entry, &timeline, self.current.as_deref());
        self.sessions.insert(id, entry);
        self.out.emit(BackendEvent::Updated(Box::new(snapshot)));
    }

    /// A failed registration only costs that kind of update, so it is
    /// skipped rather than dropping the session.
    fn subscribe(&self, id: &str, session: &Session) -> SessionTokens {
        let media = id.to_owned();
        let playback = id.to_owned();
        let timeline = id.to_owned();
        SessionTokens {
            media: session
                .MediaPropertiesChanged(&handler::<Session, MediaPropertiesChangedEventArgs>(
                    &self.tx,
                    move || Msg::Media(media.clone()),
                ))
                .ok(),
            playback: session
                .PlaybackInfoChanged(&handler::<Session, PlaybackInfoChangedEventArgs>(
                    &self.tx,
                    move || Msg::Playback(playback.clone()),
                ))
                .ok(),
            timeline: session
                .TimelinePropertiesChanged(&handler::<Session, TimelinePropertiesChangedEventArgs>(
                    &self.tx,
                    move || Msg::Timeline(timeline.clone()),
                ))
                .ok(),
        }
    }

    /// Reports the session's current state, re-anchoring seek detection on
    /// its fresh timeline.
    fn emit_snapshot(&mut self, id: &str) {
        let Some(entry) = self.sessions.get_mut(id) else {
            return;
        };
        let timeline = read_timeline(&entry.session);
        entry.anchor(&timeline);
        let snapshot = build_snapshot(id, entry, &timeline, self.current.as_deref());
        self.out.emit(BackendEvent::Updated(Box::new(snapshot)));
    }

    /// Reports the sessions whose `is_current` flipped.
    fn current_changed(&mut self) {
        let current = current_app_id(&self.manager);
        if current == self.current {
            return;
        }
        let previous = std::mem::replace(&mut self.current, current.clone());
        for id in [previous, current].into_iter().flatten() {
            self.emit_snapshot(&id);
        }
    }

    /// A new track (or new details for it): re-read the metadata; any
    /// position jump around now is the track change, not a seek.
    fn media_changed(&mut self, id: &str) {
        let Some(entry) = self.sessions.get_mut(id) else {
            return;
        };
        entry.track = read_track(&entry.session);
        entry.last_track_change = Some(Instant::now());
        entry.pending_seek = None;
        self.emit_snapshot(id);
    }

    fn playback_changed(&mut self, id: &str) {
        let Some(entry) = self.sessions.get_mut(id) else {
            return;
        };
        let state = read_state(&entry.session);
        if state == entry.state {
            return;
        }
        entry.state = state;
        if let Some(mark) = &mut entry.mark {
            mark.set_playing(state == PlaybackState::Playing, SystemTime::now());
        }
        // Not `emit_snapshot`: re-anchoring on a timeline the player may not
        // have updated for the pause yet would undo `set_playing`.
        let timeline = read_timeline(&entry.session);
        let snapshot = build_snapshot(id, entry, &timeline, self.current.as_deref());
        self.out.emit(BackendEvent::Updated(Box::new(snapshot)));
    }

    /// Timeline updates mostly report steady progress; only a jump from
    /// where playback should be is reported, as a seek.
    fn timeline_changed(&mut self, id: &str) {
        let Some(entry) = self.sessions.get_mut(id) else {
            return;
        };
        let timeline = read_timeline(&entry.session);
        let Some(position) = timeline.position else {
            return;
        };
        let at = timeline.position_at.unwrap_or_else(SystemTime::now);
        let playing = entry.state == PlaybackState::Playing;
        let mark = entry.mark.get_or_insert(Mark {
            position,
            at,
            playing,
        });
        if !mark.advance(position, at) {
            return;
        }
        if entry
            .last_track_change
            .is_some_and(|t| t.elapsed() < TRACK_CHANGE_GRACE)
        {
            return;
        }
        entry.pending_seek = Some(PendingSeek {
            position,
            at,
            due: Instant::now() + TRACK_CHANGE_GRACE,
        });
    }

    fn next_seek_due(&self) -> Option<Instant> {
        self.sessions
            .values()
            .filter_map(|entry| entry.pending_seek.as_ref().map(|seek| seek.due))
            .min()
    }

    fn flush_seeks(&mut self) {
        let now = Instant::now();
        for (id, entry) in &mut self.sessions {
            if entry.pending_seek.as_ref().is_some_and(|s| s.due <= now)
                && let Some(seek) = entry.pending_seek.take()
            {
                self.out.emit(BackendEvent::Seeked {
                    player: player_id(id),
                    position: seek.position,
                    at: seek.at,
                });
            }
        }
    }
}

impl Drop for Worker {
    /// Removes every event registration so WinRT stops calling handlers
    /// that post to a worker that is gone.
    fn drop(&mut self) {
        for entry in self.sessions.values_mut() {
            entry.unsubscribe();
        }
        if let Some(token) = self.sessions_token.take() {
            let _ = self.manager.RemoveSessionsChanged(token);
        }
        if let Some(token) = self.current_token.take() {
            let _ = self.manager.RemoveCurrentSessionChanged(token);
        }
    }
}

/// An event handler that only posts `msg()` to the worker.
fn handler<S: RuntimeType + 'static, A: RuntimeType + 'static>(
    tx: &Sender<Msg>,
    msg: impl Fn() -> Msg + Send + 'static,
) -> TypedEventHandler<S, A> {
    let tx = tx.clone();
    TypedEventHandler::new(move |_, _| {
        let _ = tx.send(msg());
        Ok(())
    })
}

/// The cached track and state with the session's `timeline`.
fn build_snapshot(id: &str, entry: &Entry, timeline: &Timeline, current: Option<&str>) -> Snapshot {
    Snapshot {
        player: player_id(id),
        track: entry.track.clone().map(|track| Track {
            duration: timeline.duration,
            ..track
        }),
        state: entry.state,
        position: timeline.position,
        position_at: timeline.position.and(timeline.position_at),
        is_current: current == Some(id),
    }
}

fn player_id(app_id: &str) -> PlayerId {
    PlayerId {
        app_id: app_id.to_owned(),
        pid: None,
        parent_app_id: None,
    }
}

fn app_id(session: &Session) -> Option<String> {
    non_empty(&session.SourceAppUserModelId().ok()?.to_string_lossy())
}

/// `None` when there is no current session (the call then fails or returns
/// null, which windows-rs also reports as an error).
fn current_app_id(manager: &Manager) -> Option<String> {
    app_id(&manager.GetCurrentSession().ok()?)
}

fn read_state(session: &Session) -> PlaybackState {
    match session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
    {
        Ok(Status::Playing) => PlaybackState::Playing,
        Ok(Status::Paused) => PlaybackState::Paused,
        _ => PlaybackState::Stopped,
    }
}

fn read_timeline(session: &Session) -> Timeline {
    let Ok(props) = session.GetTimelineProperties() else {
        return Timeline::default();
    };
    let ticks = |r: windows::core::Result<windows::Foundation::TimeSpan>| {
        r.map(|t| t.Duration).unwrap_or(0)
    };
    timeline(
        ticks(props.StartTime()),
        ticks(props.EndTime()),
        ticks(props.Position()),
        props
            .LastUpdatedTime()
            .map(|t| t.UniversalTime)
            .unwrap_or(0),
    )
}

/// The track's metadata without its duration, which comes from the
/// timeline. `None` when the player gave nothing at all.
fn read_track(session: &Session) -> Option<Track> {
    let props = session
        .TryGetMediaPropertiesAsync()
        .and_then(|op| op.join())
        .ok()?;
    let text = |r: windows::core::Result<HSTRING>| non_empty(&r.ok()?.to_string_lossy());
    let genres = props
        .Genres()
        .map(|list| list.into_iter().map(|g| g.to_string_lossy()).collect())
        .unwrap_or_else(|_| Vec::new());
    let track = Track {
        title: text(props.Title()),
        artist: text(props.Artist()),
        album: text(props.AlbumTitle()),
        album_artist: text(props.AlbumArtist()),
        track_number: props.TrackNumber().ok().and_then(positive),
        track_count: props.AlbumTrackCount().ok().and_then(positive),
        genre: join_genres(genres),
        duration: None,
        artwork: read_artwork(&props),
        id: None,
    };
    (track != Track::default()).then_some(track)
}

/// The thumbnail's bytes, when it is a JPEG/PNG (or a declared image) of
/// at most [`MAX_ARTWORK_BYTES`].
fn read_artwork(props: &MediaProperties) -> Option<Artwork> {
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_ARTWORK_BYTES {
        return None;
    }
    let data = read_bytes(&stream.GetInputStreamAt(0).ok()?, u32::try_from(size).ok()?)?;
    let content_type = stream
        .ContentType()
        .map(|t| t.to_string_lossy())
        .unwrap_or_default();
    let mime = artwork_mime(&data, &content_type)?;
    Some(Artwork {
        mime,
        data: data.into(),
    })
}

/// Reads up to `size` bytes; a load may return fewer than asked.
fn read_bytes(input: &IInputStream, size: u32) -> Option<Vec<u8>> {
    let reader = DataReader::CreateDataReader(input).ok()?;
    let mut data = Vec::with_capacity(size as usize);
    while data.len() < size as usize {
        let wanted = size - data.len() as u32;
        let loaded = reader.LoadAsync(wanted).ok()?.join().ok()?.min(wanted);
        if loaded == 0 {
            break;
        }
        let start = data.len();
        data.resize(start + loaded as usize, 0);
        reader.ReadBytes(&mut data[start..]).ok()?;
    }
    Some(data)
}

struct ProcessInfo {
    parent: u32,
    exe: String,
}

/// Every process with its parent and image file name (ToolHelp snapshot).
fn process_table() -> HashMap<u32, ProcessInfo> {
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };
    let mut table = HashMap::new();
    // SAFETY: plain Win32 calls on a snapshot handle we own and close;
    // `entry` is sized as the API requires.
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return table;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut ok = Process32FirstW(snapshot, &mut entry).is_ok();
        while ok {
            let len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            table.insert(
                entry.th32ProcessID,
                ProcessInfo {
                    parent: entry.th32ParentProcessID,
                    exe: String::from_utf16_lossy(&entry.szExeFile[..len]),
                },
            );
            ok = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
    }
    table
}

/// The process's own AppUserModelID; only packaged apps have one.
fn process_aumid(pid: u32) -> Option<String> {
    use windows::{
        Win32::{
            Foundation::{CloseHandle, ERROR_SUCCESS},
            Storage::Packaging::Appx::GetApplicationUserModelId,
            System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
        },
        core::PWSTR,
    };
    // APPLICATION_USER_MODEL_ID_MAX_LENGTH, including the terminator.
    let mut buf = [0u16; 130];
    let mut len = buf.len() as u32;
    // SAFETY: `buf` outlives the call and `len` holds its capacity; the
    // handle is closed before returning.
    let result = unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let result = GetApplicationUserModelId(handle, &mut len, Some(PWSTR(buf.as_mut_ptr())));
        let _ = CloseHandle(handle);
        result
    };
    if result != ERROR_SUCCESS {
        return None;
    }
    let len = (len as usize).min(buf.len());
    let end = buf[..len].iter().position(|&c| c == 0).unwrap_or(len);
    non_empty(&String::from_utf16_lossy(&buf[..end]))
}

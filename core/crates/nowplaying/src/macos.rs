//! MediaRemote, the private framework behind Control Center's Now Playing,
//! through mediaremote-adapter, with an AppleScript fallback for Music and
//! Spotify.
//!
//! Since macOS 15.4 MediaRemote only answers Apple's own processes, so the
//! adapter loads its framework into `/usr/bin/perl` (which is entitled) and
//! streams JSON lines. The app bundles the framework in
//! `Contents/Frameworks` and the script in `Contents/Resources`;
//! `SOUND_SCRAPER_MEDIAREMOTE_ADAPTER` names a folder holding both instead
//! (cargo examples, tests).
//!
//! When the adapter can't run, Music and Spotify are polled with
//! AppleScript instead, never launching them. When it runs but stays silent
//! while one of them makes sound (a future macOS may close the workaround)
//! that one is polled too; otherwise AppleScript is never used, so people
//! whose adapter works never see the Automation prompt.
//!
//! One worker thread owns the [`Reporter`] and talks to the sink; the
//! adapter's output is read on threads of its own that only post a [`Msg`].

use std::{
    env,
    ffi::{CStr, OsString},
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime},
};

use crate::{
    BackendEvent, NowPlayingBackend, NowPlayingError, PlaybackState, PlayerId, Snapshot,
    mediaremote_logic::{
        AdapterHealth, AdapterState, Reporter, ScriptPlayer, ScriptStatus, artwork_from_bytes,
        fallback_wanted, makes_sound, owns, parse_script_data, parse_script_output, same_track,
    },
};

/// Names a folder holding `MediaRemoteAdapter.framework` and
/// `mediaremote-adapter.pl`, for runs outside the app bundle.
const ADAPTER_DIR_VAR: &str = "SOUND_SCRAPER_MEDIAREMOTE_ADAPTER";
const FRAMEWORK: &str = "MediaRemoteAdapter.framework";
const SCRIPT: &str = "mediaremote-adapter.pl";

/// How often the AppleScript fallback asks Music and Spotify.
const POLL_INTERVAL: Duration = Duration::from_secs(1);
/// The adapter briefly reports nothing between tracks; a player gone for
/// less than this is still there.
const REMOVAL_GRACE: Duration = Duration::from_millis(1500);
/// A cover fetch that takes longer is given up (Spotify's covers are on a
/// CDN and small).
const ARTWORK_FETCH_TIMEOUT: Duration = Duration::from_secs(5);

enum Msg {
    /// The adapter's latest state: a player, or `None` when nothing plays.
    Adapter(Option<Box<Snapshot>>),
    /// The adapter process ended (or never started); why.
    AdapterGone(String),
    Stop,
}

pub struct MediaRemote {
    worker: Option<WorkerHandle>,
}

struct WorkerHandle {
    tx: Sender<Msg>,
    thread: JoinHandle<()>,
}

impl MediaRemote {
    pub fn new() -> Self {
        Self { worker: None }
    }
}

impl NowPlayingBackend for MediaRemote {
    fn start(&mut self, sink: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        self.stop();
        let (tx, rx) = mpsc::channel();
        let adapter = Adapter::spawn(tx.clone());
        let thread = thread::Builder::new()
            .name("mediaremote".into())
            .spawn(move || Worker::new(sink, adapter).run(&rx))
            .map_err(|e| NowPlayingError::Os(format!("starting MediaRemote thread: {e}")))?;
        self.worker = Some(WorkerHandle { tx, thread });
        Ok(())
    }

    fn stop(&mut self) {
        if let Some(worker) = self.worker.take() {
            let _ = worker.tx.send(Msg::Stop);
            let _ = worker.thread.join();
        }
    }

    /// The same bundle ID as the captured app (or the parent app's, for
    /// WebKit playback), or a process descending from it (browser helpers).
    fn owns(&self, player: &PlayerId, pid: u32, bundle_id: Option<&str>) -> bool {
        owns(player, pid, bundle_id, parent_pid)
    }
}

impl Drop for MediaRemote {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The running adapter: `perl mediaremote-adapter.pl <framework> stream`.
struct Adapter {
    child: Child,
    readers: Vec<JoinHandle<()>>,
}

impl Adapter {
    /// Starts the adapter, reporting to `tx`; on failure posts
    /// [`Msg::AdapterGone`] and returns `None`.
    fn spawn(tx: Sender<Msg>) -> Option<Adapter> {
        let result = adapter_files().and_then(|(script, framework)| {
            Command::new("/usr/bin/perl")
                .arg(script)
                .arg(framework)
                .args(["stream", "--micros"])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("starting the adapter: {e}"))
        });
        let mut child = match result {
            Ok(child) => child,
            Err(why) => {
                let _ = tx.send(Msg::AdapterGone(why));
                return None;
            }
        };
        let stdout = child.stdout.take()?;
        let stderr = child.stderr.take()?;
        let out = thread::Builder::new()
            .name("mediaremote-out".into())
            .spawn(move || read_stream(stdout, &tx));
        let err = thread::Builder::new()
            .name("mediaremote-err".into())
            .spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    eprintln!("mediaremote-adapter: {line}");
                }
            });
        Some(Adapter {
            child,
            readers: [out, err].into_iter().filter_map(Result::ok).collect(),
        })
    }

    fn kill(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        for reader in self.readers.drain(..) {
            let _ = reader.join();
        }
    }
}

/// Where the adapter's script and framework are: the env override, else
/// next to the executable in the app bundle.
fn adapter_files() -> Result<(PathBuf, PathBuf), String> {
    let (script, framework) = match env::var_os(ADAPTER_DIR_VAR) {
        Some(dir) => {
            let dir = PathBuf::from(dir);
            (dir.join(SCRIPT), dir.join(FRAMEWORK))
        }
        None => {
            let exe = env::current_exe()
                .and_then(|exe| exe.canonicalize())
                .map_err(|e| format!("finding the executable: {e}"))?;
            let contents = exe
                .parent()
                .and_then(|macos| macos.parent())
                .ok_or("the executable is not in an app bundle")?;
            (
                contents.join("Resources").join(SCRIPT),
                contents.join("Frameworks").join(FRAMEWORK),
            )
        }
    };
    for path in [&script, &framework] {
        if !path.exists() {
            return Err(format!("{} is missing", path.display()));
        }
    }
    Ok((script, framework))
}

/// Reads the adapter's stdout until it closes.
fn read_stream(stdout: impl Read, tx: &Sender<Msg>) {
    let mut state = AdapterState::default();
    for line in BufReader::new(stdout).lines() {
        let line = match line {
            Ok(line) => line,
            Err(e) => {
                let _ = tx.send(Msg::AdapterGone(format!("reading the adapter: {e}")));
                return;
            }
        };
        if state.apply_line(&line)
            && tx
                .send(Msg::Adapter(state.snapshot().map(Box::new)))
                .is_err()
        {
            return;
        }
    }
    let _ = tx.send(Msg::AdapterGone("the adapter exited".into()));
}

struct Worker {
    sink: Sender<BackendEvent>,
    adapter: Option<Adapter>,
    started: Instant,
    /// The player the adapter reports now.
    adapter_player: Option<PlayerId>,
    /// When to report `adapter_player` gone, after the adapter last said
    /// nothing plays.
    removal_due: Option<Instant>,
    reporter: Reporter,
    fallback: Fallback,
    /// Per [`ScriptPlayer::ALL`]: since when CoreAudio says it makes sound,
    /// and whether the fallback asks it now.
    sound_since: [Option<Instant>; 2],
    asking: [bool; 2],
}

impl Worker {
    fn new(sink: Sender<BackendEvent>, adapter: Option<Adapter>) -> Self {
        Self {
            sink,
            adapter,
            started: Instant::now(),
            adapter_player: None,
            removal_due: None,
            reporter: Reporter::default(),
            fallback: Fallback::default(),
            sound_since: [None; 2],
            asking: [false; 2],
        }
    }

    fn run(mut self, rx: &Receiver<Msg>) {
        let mut next_poll = Instant::now();
        loop {
            if Instant::now() >= next_poll {
                self.poll_fallback();
                next_poll = Instant::now() + POLL_INTERVAL;
            }
            if self.removal_due.is_some_and(|due| Instant::now() >= due) {
                self.removal_due = None;
                if let Some(player) = self.adapter_player.take() {
                    let gone = self.reporter.remove(&player);
                    self.emit(gone);
                }
            }
            let wait = [Some(next_poll), self.removal_due]
                .into_iter()
                .flatten()
                .min()
                .map_or(Duration::from_secs(3600), |due| {
                    due.saturating_duration_since(Instant::now())
                });
            match rx.recv_timeout(wait) {
                Ok(Msg::Adapter(snapshot)) => self.on_adapter(snapshot.map(|s| *s)),
                Ok(Msg::AdapterGone(why)) => {
                    eprintln!(
                        "now playing: MediaRemote adapter unavailable ({why}); using AppleScript"
                    );
                    self.removal_due = None;
                    if let Some(player) = self.adapter_player.take() {
                        let gone = self.reporter.remove(&player);
                        self.emit(gone);
                    }
                    if let Some(adapter) = self.adapter.take() {
                        adapter.kill();
                    }
                }
                Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
        if let Some(adapter) = self.adapter.take() {
            adapter.kill();
        }
    }

    fn on_adapter(&mut self, snapshot: Option<Snapshot>) {
        let Some(snapshot) = snapshot else {
            if self.adapter_player.is_some() && self.removal_due.is_none() {
                self.removal_due = Some(Instant::now() + REMOVAL_GRACE);
            }
            return;
        };
        self.removal_due = None;
        // The fallback's players hand over to the adapter's.
        self.asking = [false; 2];
        let current = snapshot.player.clone();
        let removed = self.reporter.retain(|id| *id == current);
        self.emit_all(removed);
        self.adapter_player = Some(current);
        let events = self.reporter.update(snapshot, SystemTime::now());
        self.emit_all(events);
    }

    fn health(&self) -> AdapterHealth {
        match (&self.adapter, &self.adapter_player) {
            (None, _) => AdapterHealth::Gone,
            (Some(_), Some(_)) => AdapterHealth::Reporting,
            (Some(_), None) => AdapterHealth::Silent,
        }
    }

    /// Asks the fallback players that [`fallback_wanted`] allows.
    fn poll_fallback(&mut self) {
        let health = self.health();
        if health == AdapterHealth::Reporting {
            self.sound_since = [None; 2];
            return;
        }
        let now = Instant::now();
        let playing = match health {
            AdapterHealth::Silent => sound_scraper_capture::macos::playing_bundle_ids(),
            _ => Vec::new(),
        };
        for (i, player) in ScriptPlayer::ALL.into_iter().enumerate() {
            let sound = makes_sound(player.bundle_id(), &playing);
            let since = &mut self.sound_since[i];
            *since = if sound {
                Some(since.unwrap_or(now))
            } else {
                None
            };
            let sound_for = since.map(|t| now.duration_since(t));
            let wanted = fallback_wanted(
                health,
                now.duration_since(self.started),
                sound_for,
                self.asking[i],
            );
            let snapshot = (wanted && is_running(player))
                .then(|| {
                    self.fallback
                        .poll(player, &self.reporter, SystemTime::now())
                })
                .flatten();
            self.asking[i] = wanted;
            match snapshot {
                Some(snapshot) => {
                    let events = self.reporter.update(snapshot, SystemTime::now());
                    self.emit_all(events);
                }
                None => {
                    let gone = self.reporter.retain(|id| {
                        id.app_id != player.bundle_id() || Some(id) == self.adapter_player.as_ref()
                    });
                    self.emit_all(gone);
                }
            }
        }
    }

    fn emit(&self, event: Option<BackendEvent>) {
        if let Some(event) = event {
            let _ = self.sink.send(event);
        }
    }

    fn emit_all(&self, events: Vec<BackendEvent>) {
        for event in events {
            let _ = self.sink.send(event);
        }
    }
}

/// The AppleScript fallback's memory: the covers it fetched, so each track's
/// cover is fetched once.
#[derive(Default)]
struct Fallback {
    covers: Vec<(ScriptPlayer, Option<String>, Option<crate::Artwork>)>,
}

impl Fallback {
    /// Asks a running `player` what it plays; `None` when it plays nothing.
    fn poll(
        &mut self,
        player: ScriptPlayer,
        reporter: &Reporter,
        now: SystemTime,
    ) -> Option<Snapshot> {
        let output = osascript(&player.status_script())?;
        let ScriptStatus {
            state,
            mut track,
            position,
            artwork_url,
        } = parse_script_output(&output)?;
        let id = PlayerId {
            app_id: player.bundle_id().into(),
            pid: find_process(player.process_name()),
            parent_app_id: None,
        };
        // Same track as last time: keep its cover; else fetch the new one.
        let known = reporter
            .last(&id)
            .and_then(|last| last.track.as_ref())
            .filter(|last| same_track(Some(last), Some(&track)));
        track.artwork = match known {
            Some(last) => last.artwork.clone(),
            None => self.cover(player, &track.id, artwork_url.as_deref()),
        };
        Some(Snapshot {
            player: id,
            track: Some(track),
            state,
            position,
            position_at: position.map(|_| now),
            is_current: state == PlaybackState::Playing,
        })
    }

    fn cover(
        &mut self,
        player: ScriptPlayer,
        track_id: &Option<String>,
        url: Option<&str>,
    ) -> Option<crate::Artwork> {
        if let Some((_, _, artwork)) = self
            .covers
            .iter()
            .find(|(p, id, _)| *p == player && id == track_id)
        {
            return artwork.clone();
        }
        let artwork = match player {
            ScriptPlayer::Music => osascript(
                r#"tell application id "com.apple.Music" to get raw data of artwork 1 of current track"#,
            )
            .and_then(|out| parse_script_data(&out))
            .and_then(|data| artwork_from_bytes(data, "")),
            ScriptPlayer::Spotify => url.and_then(fetch).and_then(|data| artwork_from_bytes(data, "")),
        };
        self.covers.retain(|(p, _, _)| *p != player);
        self.covers
            .push((player, track_id.clone(), artwork.clone()));
        artwork
    }
}

/// Whether a fallback player is running, without launching it.
fn is_running(player: ScriptPlayer) -> bool {
    find_process(player.process_name()).is_some()
        && osascript(&format!(
            r#"application id "{}" is running"#,
            player.bundle_id()
        ))
        .is_some_and(|out| out.trim() == "true")
}

/// Runs an AppleScript; its output, or `None` if it failed (not running,
/// Automation permission denied).
fn osascript(script: &str) -> Option<String> {
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", script])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Downloads a cover over HTTPS with the system's curl.
fn fetch(url: &str) -> Option<Vec<u8>> {
    let timeout = ARTWORK_FETCH_TIMEOUT.as_secs().to_string();
    let max = crate::smtc_logic::MAX_ARTWORK_BYTES.to_string();
    let output = Command::new("/usr/bin/curl")
        .args(["--silent", "--fail", "--location", "--proto", "=https"])
        .args(["--max-time", &timeout, "--max-filesize", &max])
        .arg(OsString::from(url))
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    (output.status.success() && !output.stdout.is_empty()).then_some(output.stdout)
}

/// The PID of the user's process named `name`, if one runs.
fn find_process(name: &str) -> Option<u32> {
    let uid = unsafe { libc::getuid() };
    all_pids().into_iter().find(|&pid| {
        bsd_info(pid).is_some_and(|info| {
            info.pbi_uid == uid
                // SAFETY: pbi_comm is a NUL-terminated C string.
                && unsafe { CStr::from_ptr(info.pbi_comm.as_ptr()) }.to_bytes() == name.as_bytes()
        })
    })
}

fn parent_pid(pid: u32) -> Option<u32> {
    bsd_info(pid).map(|info| info.pbi_ppid)
}

fn all_pids() -> Vec<u32> {
    // SAFETY: a null buffer asks for the count only.
    let count = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    let Ok(count) = usize::try_from(count) else {
        return Vec::new();
    };
    // Room for processes started since the count.
    let mut pids = vec![0 as libc::pid_t; count + 64];
    let bytes = i32::try_from(pids.len() * size_of::<libc::pid_t>()).unwrap_or(i32::MAX);
    // SAFETY: the buffer holds `bytes` bytes.
    let filled = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
    pids.truncate(usize::try_from(filled).unwrap_or(0));
    pids.into_iter()
        .filter_map(|p| u32::try_from(p).ok())
        .filter(|&p| p > 0)
        .collect()
}

fn bsd_info(pid: u32) -> Option<libc::proc_bsdinfo> {
    let pid = i32::try_from(pid).ok()?;
    let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::zeroed();
    let size = i32::try_from(size_of::<libc::proc_bsdinfo>()).ok()?;
    // SAFETY: `info` has room for a proc_bsdinfo, which PROC_PIDTBSDINFO fills.
    let filled = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    // SAFETY: fully written when the call returns its size.
    (filled == size).then(|| unsafe { info.assume_init() })
}

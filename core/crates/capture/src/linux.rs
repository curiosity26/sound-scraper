//! Linux capture through the PulseAudio client API, which PipeWire also
//! serves (pipewire-pulse), so one backend covers both sound servers.
//!
//! - All system audio: a record stream on the monitor source of the default
//!   output (or the sink named by `CaptureSource::System { device }`).
//! - One app: for each of the app's sink inputs, a record stream on its
//!   sink's monitor restricted to that sink input with
//!   `pa_stream_set_monitor_stream` (what pavucontrol's level meters do).
//!   Several sink inputs are mixed into one signal. Sink inputs the app opens
//!   later (or that come back after moving to another output, which kills
//!   the monitor stream) are picked up through sink-input events.
//!
//! Each capture runs on its own thread with a standard mainloop that the
//! thread drives itself (prepare/poll/dispatch with a short timeout), so it
//! can also check the stop flag and insert silence while nothing plays: a
//! corked or idle sink input delivers no data, which would otherwise shorten
//! the recording's timeline.

use std::{
    cell::{Cell, RefCell},
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use libpulse_binding::{
    callbacks::ListResult,
    context::{
        self, Context,
        introspect::{SinkInfo, SinkInputInfo},
        subscribe::{Facility, InterestMaskSet, Operation as SubscribeOp},
    },
    def::BufferAttr,
    mainloop::standard::Mainloop,
    sample::{Format, Spec},
    stream::{self, PeekResult, Stream},
    time::MicroSeconds,
};

use crate::{
    AppTarget, AudioChunk, CaptureBackend, CaptureError, CaptureSource, DeviceId, OutputDevice,
    Session,
};

const CLIENT_NAME: &str = "Sound Scraper";
/// Connecting and every setup query give up after this long.
const SERVER_TIMEOUT: Duration = Duration::from_secs(3);
/// How often the capture loop wakes up without server activity.
const TICK: Duration = Duration::from_millis(10);
/// Record fragment size: small, so the visualizer stays responsive.
const FRAGMENT: Duration = Duration::from_millis(20);
/// Insert silence once no audio has arrived for this long.
const SILENCE_GAP: Duration = Duration::from_millis(100);
/// When mixing several streams, one that lags another by more than this
/// counts as silent (it is paused), so it doesn't stall the mix.
const MIX_LAG: Duration = Duration::from_millis(100);

#[derive(Debug, Default)]
pub struct PulseCapture {
    next_id: u64,
    running: HashMap<u64, Running>,
}

impl PulseCapture {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CaptureBackend for PulseCapture {
    fn list_outputs(&self) -> Vec<OutputDevice> {
        outputs().unwrap_or_default()
    }

    fn list_audio_apps(&self) -> Vec<AppTarget> {
        audio_apps().unwrap_or_default()
    }

    fn start(
        &mut self,
        source: CaptureSource,
        sink: SyncSender<AudioChunk>,
    ) -> Result<Session, CaptureError> {
        let stop = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = mpsc::channel();
        let thread_stop = stop.clone();
        let thread = std::thread::Builder::new()
            .name("sound-scraper-pulse".into())
            .spawn(move || capture_thread(source, sink, thread_stop, ready_tx))
            .map_err(os_err)?;
        let running = Running {
            stop,
            thread: Some(thread),
        };
        match ready_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => {
                self.next_id += 1;
                self.running.insert(self.next_id, running);
                Ok(Session { id: self.next_id })
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err(CaptureError::Os(
                "timed out starting capture from the sound server".into(),
            )),
        }
    }

    fn stop(&mut self, session: Session) {
        drop(self.running.remove(&session.id));
    }
}

#[derive(Debug)]
struct Running {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn os_err(e: impl std::fmt::Display) -> CaptureError {
    CaptureError::Os(e.to_string())
}

// ---------------------------------------------------------------------------
// Connection and queries

/// A connected client. Fields drop in order: the context before its mainloop.
struct Conn {
    context: Context,
    mainloop: Mainloop,
}

impl Conn {
    /// Connects without autospawning a server; fails quickly (an error, not
    /// a hang) when no PulseAudio or PipeWire server is running.
    fn connect() -> Result<Self, CaptureError> {
        let no_server = |detail: String| {
            CaptureError::Os(format!(
                "can't connect to the sound server; is PulseAudio or PipeWire running? ({detail})"
            ))
        };
        let mainloop = Mainloop::new().ok_or_else(|| no_server("no mainloop".into()))?;
        let mut context = Context::new(&mainloop, CLIENT_NAME)
            .ok_or_else(|| no_server("no client context".into()))?;
        context
            .connect(None, context::FlagSet::NOAUTOSPAWN, None)
            .map_err(|e| no_server(format!("{e}")))?;
        let mut conn = Self { context, mainloop };
        let deadline = Instant::now() + SERVER_TIMEOUT;
        loop {
            match conn.context.get_state() {
                context::State::Ready => return Ok(conn),
                context::State::Failed | context::State::Terminated => {
                    return Err(no_server(format!("{}", conn.context.errno())));
                }
                _ => {}
            }
            if Instant::now() >= deadline {
                return Err(no_server("timed out".into()));
            }
            conn.step(Duration::from_millis(50))?;
        }
    }

    /// Runs one mainloop iteration, waiting at most `timeout` for events.
    fn step(&mut self, timeout: Duration) -> Result<(), CaptureError> {
        let us = MicroSeconds(timeout.as_micros() as u64);
        self.mainloop.prepare(Some(us)).map_err(os_err)?;
        self.mainloop.poll().map_err(os_err)?;
        self.mainloop.dispatch().map_err(os_err)?;
        Ok(())
    }

    fn check(&self) -> Result<(), CaptureError> {
        if self.context.get_state().is_good() {
            Ok(())
        } else {
            Err(CaptureError::Os(format!(
                "lost the connection to the sound server: {}",
                self.context.errno()
            )))
        }
    }

    /// Iterates until `done()` or the server timeout.
    fn wait(&mut self, done: impl Fn() -> bool) -> Result<(), CaptureError> {
        let deadline = Instant::now() + SERVER_TIMEOUT;
        while !done() {
            self.check()?;
            if Instant::now() >= deadline {
                return Err(CaptureError::Os("the sound server didn't answer".into()));
            }
            self.step(Duration::from_millis(50))?;
        }
        Ok(())
    }

    fn default_sink_name(&mut self) -> Result<Option<String>, CaptureError> {
        let result: Rc<RefCell<Option<Option<String>>>> = Rc::default();
        let r = result.clone();
        let _op = self.context.introspect().get_server_info(move |info| {
            *r.borrow_mut() = Some(info.default_sink_name.as_ref().map(|n| n.to_string()));
        });
        self.wait(|| result.borrow().is_some())?;
        Ok(result.take().flatten())
    }

    fn sinks(&mut self) -> Result<Vec<SinkRec>, CaptureError> {
        let (items, done) = list_collector();
        let (i, d) = (items.clone(), done.clone());
        let _op = self
            .context
            .introspect()
            .get_sink_info_list(move |r| match r {
                ListResult::Item(info) => i.borrow_mut().push(SinkRec::from(info)),
                ListResult::End | ListResult::Error => d.set(true),
            });
        self.wait(|| done.get())?;
        Ok(items.take())
    }

    fn sink_inputs(&mut self) -> Result<Vec<InputRec>, CaptureError> {
        let (items, done) = list_collector();
        let (i, d) = (items.clone(), done.clone());
        let _op = self
            .context
            .introspect()
            .get_sink_input_info_list(move |r| match r {
                ListResult::Item(info) => i.borrow_mut().push(InputRec::from(info)),
                ListResult::End | ListResult::Error => d.set(true),
            });
        self.wait(|| done.get())?;
        Ok(items.take())
    }
}

fn list_collector<T>() -> (Rc<RefCell<Vec<T>>>, Rc<Cell<bool>>) {
    (Rc::default(), Rc::default())
}

#[derive(Debug, Clone)]
struct SinkRec {
    index: u32,
    name: String,
    description: Option<String>,
    monitor_source: u32,
    monitor_name: Option<String>,
    rate: u32,
    channels: u8,
}

impl From<&SinkInfo<'_>> for SinkRec {
    fn from(info: &SinkInfo<'_>) -> Self {
        Self {
            index: info.index,
            name: info.name.as_deref().unwrap_or_default().to_string(),
            description: info.description.as_ref().map(|d| d.to_string()),
            monitor_source: info.monitor_source,
            monitor_name: info.monitor_source_name.as_ref().map(|n| n.to_string()),
            rate: info.sample_spec.rate,
            channels: info.sample_spec.channels,
        }
    }
}

impl SinkRec {
    /// What we record in: float at the sink's rate and channel count.
    fn spec(&self) -> Spec {
        let rate = if self.rate > 0 { self.rate } else { 48_000 };
        let channels = if self.channels > 0 { self.channels } else { 2 };
        Spec {
            format: Format::FLOAT32NE,
            rate,
            channels,
        }
    }
}

#[derive(Debug, Clone)]
struct InputRec {
    index: u32,
    sink: u32,
    pid: Option<u32>,
    app_name: Option<String>,
    binary: Option<String>,
    corked: bool,
}

impl From<&SinkInputInfo<'_>> for InputRec {
    fn from(info: &SinkInputInfo<'_>) -> Self {
        let prop = |key: &str| info.proplist.get_str(key).filter(|v| !v.is_empty());
        Self {
            index: info.index,
            sink: info.sink,
            pid: prop("application.process.id").and_then(|p| p.trim().parse().ok()),
            app_name: prop("application.name"),
            binary: prop("application.process.binary"),
            corked: info.corked,
        }
    }
}

// ---------------------------------------------------------------------------
// Pickers

fn outputs() -> Result<Vec<OutputDevice>, CaptureError> {
    let mut conn = Conn::connect()?;
    let default = conn.default_sink_name()?;
    Ok(conn
        .sinks()?
        .into_iter()
        .map(|s| OutputDevice {
            is_default: default.as_deref() == Some(s.name.as_str()),
            name: s.description.clone().unwrap_or_else(|| s.name.clone()),
            id: DeviceId(s.name),
        })
        .collect())
}

/// Apps with sink inputs, grouped by (root) process, playing ones first.
fn audio_apps() -> Result<Vec<AppTarget>, CaptureError> {
    let inputs = Conn::connect()?.sink_inputs()?;
    let me = std::process::id();
    let mut apps: Vec<AppTarget> = Vec::new();
    for input in inputs {
        let Some(pid) = input.pid else { continue };
        let root = root_process(pid);
        if pid == me || root == me {
            continue;
        }
        let playing = !input.corked;
        if let Some(existing) = apps.iter_mut().find(|a| a.pid == root) {
            existing.is_playing |= playing;
            continue;
        }
        let name = input
            .app_name
            .clone()
            .or_else(|| input.binary.clone())
            .unwrap_or_else(|| format!("pid {root}"));
        apps.push(AppTarget {
            pid: root,
            name,
            bundle_id: exe_path(root).or(input.binary),
            icon: None,
            is_playing: playing,
        });
    }
    apps.sort_by(|a, b| {
        b.is_playing
            .cmp(&a.is_playing)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(apps)
}

fn exe_path(pid: u32) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

fn parent_pid(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // "pid (comm) state ppid …"; comm may contain spaces and parentheses.
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(1)?.parse().ok()
}

/// Walks up while the parent runs the same executable, so a browser's audio
/// helper process maps to the browser itself.
fn root_process(pid: u32) -> u32 {
    let mut current = pid;
    for _ in 0..32 {
        let (Some(exe), Some(parent)) = (exe_path(current), parent_pid(current)) else {
            break;
        };
        if parent <= 1 || parent == current {
            break;
        }
        match exe_path(parent) {
            Some(parent_exe) if Path::new(&parent_exe) == Path::new(&exe) => current = parent,
            _ => break,
        }
    }
    current
}

// ---------------------------------------------------------------------------
// Capture

/// One record stream and the samples it delivered that aren't mixed yet.
struct Tap {
    /// The monitored sink input, for app capture.
    input: Option<u32>,
    stream: Stream,
    queue: VecDeque<f32>,
}

impl Tap {
    fn open(
        conn: &mut Conn,
        spec: &Spec,
        device: &str,
        input: Option<u32>,
    ) -> Result<Self, CaptureError> {
        let mut stream = Stream::new(&mut conn.context, "Sound Scraper capture", spec, None)
            .ok_or_else(|| CaptureError::Os("can't create a record stream".into()))?;
        let mut flags = stream::FlagSet::ADJUST_LATENCY;
        if let Some(index) = input {
            stream.set_monitor_stream(index).map_err(os_err)?;
            flags |= stream::FlagSet::DONT_MOVE;
        }
        let attr = BufferAttr {
            maxlength: u32::MAX,
            tlength: u32::MAX,
            prebuf: u32::MAX,
            minreq: u32::MAX,
            fragsize: spec.usec_to_bytes(MicroSeconds(FRAGMENT.as_micros() as u64)) as u32,
        };
        stream
            .connect_record(Some(device), Some(&attr), flags)
            .map_err(os_err)?;
        Ok(Self {
            input,
            stream,
            queue: VecDeque::new(),
        })
    }

    fn state(&self) -> stream::State {
        self.stream.get_state()
    }

    fn is_dead(&self) -> bool {
        matches!(
            self.state(),
            stream::State::Failed | stream::State::Terminated
        )
    }

    /// Moves everything the server delivered into `queue`.
    fn drain(&mut self) {
        if self.state() != stream::State::Ready {
            return;
        }
        loop {
            match self.stream.peek() {
                Ok(PeekResult::Data(bytes)) => {
                    self.queue.extend(
                        bytes
                            .as_chunks::<4>()
                            .0
                            .iter()
                            .map(|b| f32::from_ne_bytes(*b)),
                    );
                }
                Ok(PeekResult::Hole(n)) => self.queue.extend(std::iter::repeat_n(0.0, n / 4)),
                Ok(PeekResult::Empty) | Err(_) => break,
            }
            if self.stream.discard().is_err() {
                break;
            }
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        if self.state().is_good() {
            let _ = self.stream.disconnect();
        }
    }
}

/// Sums the frames every queue has; a queue lagging the fullest one by more
/// than `max_lag` frames is treated as silent for the difference. Returns
/// interleaved samples clamped to [-1, 1] (empty when nothing is ready).
fn mix(queues: &mut [&mut VecDeque<f32>], channels: usize, max_lag: usize) -> Vec<f32> {
    let lens = queues.iter().map(|q| q.len() / channels);
    let (Some(min), Some(max)) = (lens.clone().min(), lens.max()) else {
        return Vec::new();
    };
    let frames = min.max(max.saturating_sub(max_lag));
    if frames == 0 {
        return Vec::new();
    }
    if let [only] = queues {
        return only.drain(..frames * channels).collect();
    }
    let mut out = vec![0.0f32; frames * channels];
    for q in queues.iter_mut() {
        let take = (q.len() / channels).min(frames) * channels;
        for (o, s) in out.iter_mut().zip(q.drain(..take)) {
            *o += s;
        }
    }
    for s in &mut out {
        *s = s.clamp(-1.0, 1.0);
    }
    out
}

/// Owns the connection for one recording. Reports setup success or failure
/// through `ready`, then streams until `stop` is set or the server goes away.
/// Returning drops `sink`, which tells the consumer the capture ended.
fn capture_thread(
    source: CaptureSource,
    sink: SyncSender<AudioChunk>,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Result<(), CaptureError>>,
) {
    let mut state = match Capture::setup(&source) {
        Ok(state) => state,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    let _ = ready.send(Ok(()));
    state.run(&sink, &stop);
}

/// Sink-input events and query results, filled by mainloop callbacks.
#[derive(Default)]
struct Pending {
    events: Vec<(SubscribeOp, u32)>,
    inputs: Vec<InputRec>,
    sinks: Vec<SinkRec>,
}

struct Capture {
    taps: Vec<Tap>,
    /// `Some(pid)` when recording one app's (root) process.
    app: Option<u32>,
    spec: Spec,
    sinks: HashMap<u32, SinkRec>,
    /// Sink inputs known to belong to other processes.
    ignored: HashSet<u32>,
    /// Our sink inputs waiting for their sink's info.
    waiting: Vec<InputRec>,
    pending: Rc<RefCell<Pending>>,
    // Last: the taps above must drop before the connection.
    conn: Conn,
}

impl Capture {
    fn setup(source: &CaptureSource) -> Result<Self, CaptureError> {
        let mut conn = Conn::connect()?;
        let sinks: HashMap<u32, SinkRec> =
            conn.sinks()?.into_iter().map(|s| (s.index, s)).collect();
        let mut taps = Vec::new();
        let (spec, app) = match source {
            CaptureSource::System { device } => {
                let name = match device {
                    Some(DeviceId(id)) => Some(id.clone()),
                    None => conn.default_sink_name()?,
                };
                let target = name
                    .as_deref()
                    .and_then(|n| sinks.values().find(|s| s.name == n))
                    .or_else(|| (device.is_none()).then(|| sinks.values().next()).flatten())
                    .ok_or_else(|| {
                        CaptureError::Os(match &name {
                            Some(n) => format!("output device {n} not found"),
                            None => "no output device found".into(),
                        })
                    })?;
                let monitor = target
                    .monitor_name
                    .clone()
                    .unwrap_or_else(|| format!("{}.monitor", target.name));
                let spec = target.spec();
                taps.push(Tap::open(&mut conn, &spec, &monitor, None)?);
                (spec, None)
            }
            CaptureSource::App { app } => {
                let mine: Vec<InputRec> = conn
                    .sink_inputs()?
                    .into_iter()
                    .filter(|i| {
                        i.pid
                            .is_some_and(|p| p == app.pid || root_process(p) == app.pid)
                    })
                    .collect();
                let Some(first) = mine.first() else {
                    return Err(CaptureError::Os(format!(
                        "{} isn't playing audio (it has no open audio stream); start playback \
                         and try again",
                        app.name
                    )));
                };
                let spec = sinks
                    .get(&first.sink)
                    .map(SinkRec::spec)
                    .unwrap_or_else(|| Spec {
                        format: Format::FLOAT32NE,
                        rate: 48_000,
                        channels: 2,
                    });
                for input in &mine {
                    if let Some(sink) = sinks.get(&input.sink) {
                        let device = sink.monitor_source.to_string();
                        taps.push(Tap::open(&mut conn, &spec, &device, Some(input.index))?);
                    }
                }
                (spec, Some(app.pid))
            }
        };
        conn.wait(|| taps.iter().all(|t| t.state() != stream::State::Creating))?;
        taps.retain(|t| t.state() == stream::State::Ready);
        if taps.is_empty() {
            return Err(CaptureError::Os(format!(
                "the sound server refused the record stream: {}",
                conn.context.errno()
            )));
        }

        let pending: Rc<RefCell<Pending>> = Rc::default();
        if app.is_some() {
            let p = pending.clone();
            conn.context
                .set_subscribe_callback(Some(Box::new(move |facility, op, index| {
                    if let (Some(Facility::SinkInput), Some(op)) = (facility, op) {
                        p.borrow_mut().events.push((op, index));
                    }
                })));
            let _op = conn.context.subscribe(InterestMaskSet::SINK_INPUT, |_| {});
        }
        Ok(Self {
            taps,
            app,
            spec,
            sinks,
            ignored: HashSet::new(),
            waiting: Vec::new(),
            pending,
            conn,
        })
    }

    fn run(&mut self, sink: &SyncSender<AudioChunk>, stop: &AtomicBool) {
        let channels = usize::from(self.spec.channels);
        let rate = self.spec.rate;
        let max_lag = (MIX_LAG.as_secs_f64() * f64::from(rate)) as usize;
        let started = Instant::now();
        let mut last_audio = started;
        let mut frames_sent: u64 = 0;
        let send = |samples: Vec<f32>, frames_sent: &mut u64| {
            *frames_sent += (samples.len() / channels) as u64;
            let _ = sink.try_send(AudioChunk {
                samples,
                sample_rate: rate,
                channels: channels as u16,
            });
        };
        while !stop.load(Ordering::Acquire) {
            if self.conn.step(TICK).is_err() || self.conn.check().is_err() {
                break;
            }
            for tap in &mut self.taps {
                tap.drain();
            }
            // A dead tap's last samples are dropped. Its sink input either
            // ended or moved to another output; look it up again so a moved
            // one gets a new tap.
            let mut lost = Vec::new();
            self.taps.retain(|t| {
                if t.is_dead() {
                    lost.extend(t.input);
                }
                !t.is_dead()
            });
            if self.app.is_some() {
                let mut pending = self.pending.borrow_mut();
                pending
                    .events
                    .extend(lost.into_iter().map(|i| (SubscribeOp::Changed, i)));
                drop(pending);
                self.follow_sink_inputs();
            } else if self.taps.is_empty() {
                break; // the output device went away
            }

            let mut queues: Vec<_> = self.taps.iter_mut().map(|t| &mut t.queue).collect();
            let samples = mix(&mut queues, channels, max_lag);
            if !samples.is_empty() {
                last_audio = Instant::now();
                send(samples, &mut frames_sent);
            } else if last_audio.elapsed() >= SILENCE_GAP {
                // Nothing is playing: fill up to wall-clock time with silence.
                let expected = (started.elapsed().as_secs_f64() * f64::from(rate)) as u64;
                let missing = expected.saturating_sub(frames_sent);
                if missing > 0 {
                    last_audio = Instant::now();
                    send(vec![0.0; missing as usize * channels], &mut frames_sent);
                }
            }
        }
    }

    /// Opens taps for sink inputs of the recorded app that appeared (or
    /// moved to another output) since the capture started.
    fn follow_sink_inputs(&mut self) {
        let Some(pid) = self.app else { return };
        let (events, inputs, sinks) = {
            let mut p = self.pending.borrow_mut();
            (
                std::mem::take(&mut p.events),
                std::mem::take(&mut p.inputs),
                std::mem::take(&mut p.sinks),
            )
        };
        for (op, index) in events {
            match op {
                SubscribeOp::Removed => {
                    self.ignored.remove(&index);
                }
                SubscribeOp::New | SubscribeOp::Changed => {
                    let tapped = self.taps.iter().any(|t| t.input == Some(index));
                    if tapped || self.ignored.contains(&index) {
                        continue;
                    }
                    let p = self.pending.clone();
                    let _op = self
                        .conn
                        .context
                        .introspect()
                        .get_sink_input_info(index, move |r| {
                            if let ListResult::Item(info) = r {
                                p.borrow_mut().inputs.push(InputRec::from(info));
                            }
                        });
                }
            }
        }
        for sink in sinks {
            self.sinks.insert(sink.index, sink);
        }
        let mut candidates = std::mem::take(&mut self.waiting);
        for input in inputs {
            let ours = input
                .pid
                .is_some_and(|p| p == pid || root_process(p) == pid);
            if !ours {
                self.ignored.insert(input.index);
            } else if !candidates.iter().any(|c| c.index == input.index) {
                candidates.push(input);
            }
        }
        for input in candidates {
            if self.taps.iter().any(|t| t.input == Some(input.index)) {
                continue;
            }
            let Some(sink) = self.sinks.get(&input.sink) else {
                // Unknown output (plugged in after we started): ask for it.
                let p = self.pending.clone();
                let _op =
                    self.conn
                        .context
                        .introspect()
                        .get_sink_info_by_index(input.sink, move |r| {
                            if let ListResult::Item(info) = r {
                                p.borrow_mut().sinks.push(SinkRec::from(info));
                            }
                        });
                self.waiting.push(input);
                continue;
            };
            let device = sink.monitor_source.to_string();
            if let Ok(tap) = Tap::open(&mut self.conn, &self.spec, &device, Some(input.index)) {
                self.taps.push(tap);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixes_streams_and_does_not_stall_on_a_paused_one() {
        // Equal data: summed and clamped.
        let mut a: VecDeque<f32> = [0.25, 0.5, 0.75, -0.75].into();
        let mut b: VecDeque<f32> = [0.25, 0.75, 0.5, -0.5].into();
        let out = mix(&mut [&mut a, &mut b], 2, 10);
        assert_eq!(out, vec![0.5, 1.0, 1.0, -1.0]);
        assert!(a.is_empty() && b.is_empty());

        // B lags by less than the limit: wait for it.
        let mut a: VecDeque<f32> = vec![0.1; 8].into();
        let mut b: VecDeque<f32> = vec![0.1; 2].into();
        let out = mix(&mut [&mut a, &mut b], 2, 10);
        assert_eq!(out.len(), 2);
        assert_eq!((a.len(), b.len()), (6, 0));
        let out = mix(&mut [&mut a, &mut b], 2, 10);
        assert!(out.is_empty());

        // B paused while A runs ahead past the limit: A plays alone.
        let mut a: VecDeque<f32> = vec![0.1; 30].into();
        let mut b: VecDeque<f32> = VecDeque::new();
        let out = mix(&mut [&mut a, &mut b], 2, 10);
        assert_eq!(out.len(), 10);
        assert_eq!(a.len(), 20);

        // One stream passes through untouched.
        let mut a: VecDeque<f32> = [2.0, -2.0, 0.5].into();
        assert_eq!(mix(&mut [&mut a], 2, 10), vec![2.0, -2.0]);
        assert_eq!(a.len(), 1);

        assert!(mix(&mut [], 2, 10).is_empty());
    }

    #[test]
    fn own_process_is_its_own_root() {
        let me = std::process::id();
        assert!(exe_path(me).is_some());
        assert!(parent_pid(me).is_some());
        assert_eq!(root_process(u32::MAX), u32::MAX);
    }
}

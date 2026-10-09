//! Playback of a recording through the default output device.
//!
//! ```text
//! Empty --load--> Stopped --play--> Playing --pause--> Paused --play--> Playing
//! Playing/Paused --stop or end of file--> Stopped (rewound)
//! any --unload--> Empty
//! ```
//!
//! A worker thread per loaded file owns the decoder (Symphonia), the
//! resampler (to the device rate), the output stream (cpal) and the
//! visualizer's analyzer. It decodes ahead into a lock-free ring; the output
//! callback drains the ring to the device and feeds the same samples to the
//! visualizer's tap, so the visualizer follows what is heard. Seeking (or a
//! rebuilt stream) swaps in a fresh ring, which drops whatever was queued.
//!
//! The analyzer publishes to the same [`VisHub`] as the recorder's, so the
//! visualizer and level meters show playback the way they show a recording.
//! Only one of them may run at a time: the recorder unloads the player first.

use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rubato::{FftFixedIn, Resampler};
use sound_scraper_vis::{Analyzer, Tap, VisHub};
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{CODEC_TYPE_NULL, Decoder, DecoderOptions},
    errors::Error as SymphoniaError,
    formats::{FormatOptions, FormatReader, SeekMode, SeekTo},
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
    units::Time,
};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
/// Decoded audio queued ahead of the device, in device frames (~0.35 s at
/// 48 kHz): enough to ride out a busy moment, little enough that a seek
/// is heard right away.
const RING_FRAMES: usize = 16 * 1024;
/// Resampler input block, in frames.
const RESAMPLE_CHUNK: usize = 1024;
/// How long a command waits for the worker.
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);
/// The worker's idle poll, while the ring is full or nothing plays.
const IDLE_WAIT: Duration = Duration::from_millis(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayerState {
    /// Nothing loaded.
    Empty,
    /// Loaded, not playing; the visualizer is idle.
    Stopped,
    Playing,
    /// The visualizer stays live (and falls silent).
    Paused,
}

impl PlayerState {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Stopped,
            2 => Self::Playing,
            3 => Self::Paused,
            _ => Self::Empty,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlayerEvent {
    StateChanged(PlayerState),
    /// About 10 Hz while playing, and after loads, seeks and stops. Levels
    /// are linear (0..=1), [left, right].
    Progress {
        position: Duration,
        duration: Duration,
        peak: [f32; 2],
        rms: [f32; 2],
    },
    Error {
        message: String,
    },
}

pub type PlayerSink = Arc<dyn Fn(&PlayerEvent) + Send + Sync>;

/// State readable without locking the player.
#[derive(Default)]
pub struct PlayerStatus {
    state: AtomicU8,
    position_ms: AtomicU64,
    duration_ms: AtomicU64,
    path: Mutex<Option<PathBuf>>,
}

impl PlayerStatus {
    pub fn state(&self) -> PlayerState {
        PlayerState::from_u8(self.state.load(Ordering::Acquire))
    }

    pub fn position(&self) -> Duration {
        Duration::from_millis(self.position_ms.load(Ordering::Acquire))
    }

    pub fn duration(&self) -> Duration {
        Duration::from_millis(self.duration_ms.load(Ordering::Acquire))
    }

    /// The loaded file.
    pub fn path(&self) -> Option<PathBuf> {
        self.path.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

pub struct Player {
    hub: Arc<VisHub>,
    events: Option<PlayerSink>,
    status: Arc<PlayerStatus>,
    worker: Option<Worker>,
}

struct Worker {
    tx: Sender<(Command, Reply)>,
    thread: JoinHandle<()>,
}

#[derive(Debug, Clone, Copy)]
enum Command {
    Play,
    Pause,
    Stop,
    Seek(Duration),
}

type Reply = Sender<Result<(), String>>;

impl Player {
    /// A player whose analysis goes to `hub` (the recorder's).
    pub fn new(hub: Arc<VisHub>) -> Self {
        Self {
            hub,
            events: None,
            status: Arc::default(),
            worker: None,
        }
    }

    pub fn set_event_sink(&mut self, sink: Option<PlayerSink>) {
        self.events = sink;
    }

    pub fn status(&self) -> Arc<PlayerStatus> {
        self.status.clone()
    }

    pub fn state(&self) -> PlayerState {
        self.status.state()
    }

    /// Loads `path`, stopped at the start, replacing what was loaded.
    pub fn load(&mut self, path: &Path) -> Result<(), String> {
        self.unload();
        let source = Source::open(path)?;
        self.status
            .duration_ms
            .store(source.duration.as_millis() as u64, Ordering::Release);
        self.status.position_ms.store(0, Ordering::Release);
        *self.status.path.lock().unwrap_or_else(|e| e.into_inner()) = Some(path.to_path_buf());
        let (tx, rx) = mpsc::channel();
        let job = Job::new(
            source,
            self.hub.clone(),
            self.status.clone(),
            self.events.clone(),
        );
        let thread = std::thread::Builder::new()
            .name("sound-scraper-player".into())
            .spawn(move || job.run(rx))
            .map_err(|e| e.to_string())?;
        self.worker = Some(Worker { tx, thread });
        set_state(&self.status, &self.events, PlayerState::Stopped);
        emit_progress(&self.status, &self.events, [0.0; 2], [0.0; 2]);
        Ok(())
    }

    /// Stops and forgets the loaded file. Blocks until the worker has let go
    /// of the output device and the visualizer.
    pub fn unload(&mut self) {
        if let Some(worker) = self.worker.take() {
            drop(worker.tx);
            let _ = worker.thread.join();
        }
        *self.status.path.lock().unwrap_or_else(|e| e.into_inner()) = None;
        self.status.position_ms.store(0, Ordering::Release);
        self.status.duration_ms.store(0, Ordering::Release);
        if self.state() != PlayerState::Empty {
            set_state(&self.status, &self.events, PlayerState::Empty);
        }
    }

    pub fn play(&mut self) -> Result<(), String> {
        self.send(Command::Play)
    }

    pub fn pause(&mut self) -> Result<(), String> {
        self.send(Command::Pause)
    }

    /// Stops and rewinds to the start.
    pub fn stop(&mut self) -> Result<(), String> {
        self.send(Command::Stop)
    }

    /// Moves to `position` (clamped to the file), keeping the state.
    pub fn seek(&mut self, position: Duration) -> Result<(), String> {
        self.send(Command::Seek(position))
    }

    fn send(&mut self, command: Command) -> Result<(), String> {
        let Some(worker) = &self.worker else {
            return Err("nothing is loaded".into());
        };
        let (reply_tx, reply_rx) = mpsc::channel();
        worker
            .tx
            .send((command, reply_tx))
            .map_err(|_| "the player stopped".to_string())?;
        reply_rx
            .recv_timeout(REPLY_TIMEOUT)
            .map_err(|_| format!("the player didn't respond to {command:?}"))?
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        self.unload();
    }
}

fn set_state(status: &PlayerStatus, events: &Option<PlayerSink>, state: PlayerState) {
    status.state.store(state as u8, Ordering::Release);
    emit(events, &PlayerEvent::StateChanged(state));
}

fn emit_progress(
    status: &PlayerStatus,
    events: &Option<PlayerSink>,
    peak: [f32; 2],
    rms: [f32; 2],
) {
    emit(
        events,
        &PlayerEvent::Progress {
            position: status.position(),
            duration: status.duration(),
            peak,
            rms,
        },
    );
}

fn emit(events: &Option<PlayerSink>, event: &PlayerEvent) {
    if let Some(sink) = events {
        sink(event);
    }
}

// ------------------------------------------------------------------ source

/// An MP3 being decoded to interleaved stereo f32 at its own rate (also
/// used by the track editor).
pub(crate) struct Source {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    pub(crate) rate: u32,
    pub(crate) duration: Duration,
    /// Length in frames (gapless), when the file says.
    pub(crate) n_frames: Option<u64>,
    /// Frames before this timestamp are dropped (after an accurate seek).
    skip_until: u64,
    eof: bool,
}

impl Source {
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("opening {}: {e}", path.display()))?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        let options = FormatOptions {
            enable_gapless: true,
            ..Default::default()
        };
        let probed = symphonia::default::get_probe()
            .format(&hint, stream, &options, &MetadataOptions::default())
            .map_err(|e| format!("{} isn't a playable MP3: {e}", path.display()))?;
        let format = probed.format;
        let track = format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or_else(|| format!("{} has no audio", path.display()))?;
        let params = track.codec_params.clone();
        let rate = params.sample_rate.ok_or("unknown sample rate")?;
        let decoder = symphonia::default::get_codecs()
            .make(&params, &DecoderOptions::default())
            .map_err(|e| format!("can't decode {}: {e}", path.display()))?;
        let duration = params
            .n_frames
            .map(|n| Duration::from_secs_f64(n as f64 / f64::from(rate)))
            .unwrap_or_default();
        Ok(Self {
            track_id: track.id,
            format,
            decoder,
            rate,
            duration,
            n_frames: params.n_frames,
            skip_until: 0,
            eof: false,
        })
    }

    /// Seeks to frame `ts` exactly (decoding resumes there); false if it
    /// couldn't (past the end).
    pub(crate) fn seek_frame(&mut self, ts: u64) -> bool {
        self.eof = false;
        self.skip_until = 0;
        let to = SeekTo::TimeStamp {
            ts,
            track_id: self.track_id,
        };
        match self.format.seek(SeekMode::Accurate, to) {
            Ok(seeked) => {
                self.decoder.reset();
                self.skip_until = seeked.required_ts;
                true
            }
            Err(_) => {
                self.eof = true;
                false
            }
        }
    }

    /// Seeks to `at`; returns the position actually reached.
    fn seek(&mut self, at: Duration) -> Duration {
        let at = if self.duration > Duration::ZERO {
            at.min(self.duration)
        } else {
            at
        };
        self.eof = false;
        self.skip_until = 0;
        let to = SeekTo::Time {
            time: Time::from(at.as_secs_f64()),
            track_id: Some(self.track_id),
        };
        match self.format.seek(SeekMode::Accurate, to) {
            Ok(seeked) => {
                self.decoder.reset();
                self.skip_until = seeked.required_ts;
                Duration::from_secs_f64(seeked.required_ts as f64 / f64::from(self.rate))
            }
            // Past the end (or unseekable): treat as finished there.
            Err(_) => {
                self.eof = true;
                at
            }
        }
    }

    /// Decodes the next packet into interleaved stereo, appended to `out`.
    /// Returns false at the end of the file.
    pub(crate) fn decode(&mut self, out: &mut Vec<f32>) -> bool {
        loop {
            if self.eof {
                return false;
            }
            let packet = match self.format.next_packet() {
                Ok(packet) => packet,
                Err(SymphoniaError::ResetRequired) => {
                    self.decoder.reset();
                    continue;
                }
                Err(_) => {
                    self.eof = true;
                    return false;
                }
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            let decoded = match self.decoder.decode(&packet) {
                Ok(decoded) => decoded,
                // A damaged frame: skip it.
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(_) => {
                    self.eof = true;
                    return false;
                }
            };
            let spec = *decoded.spec();
            let channels = spec.channels.count().max(1);
            let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
            buf.copy_interleaved_ref(decoded);
            let samples = buf.samples();
            let frames = samples.len() / channels;
            let skip = self
                .skip_until
                .saturating_sub(packet.ts())
                .min(frames as u64) as usize;
            for frame in samples.chunks_exact(channels).skip(skip) {
                let left = frame[0];
                let right = if channels > 1 { frame[1] } else { left };
                out.push(left);
                out.push(right);
            }
            if skip < frames {
                return true;
            }
        }
    }
}

// ------------------------------------------------------------------ output

/// What the output callback drains. The worker locks it only to swap in a
/// new ring, so the callback (which only tries the lock) never waits.
struct Feed {
    consumer: Option<rtrb::Consumer<f32>>,
    tap: Option<Tap>,
}

/// Bookkeeping for the current ring, written by the callback under the
/// feed lock and read by the worker without it.
#[derive(Default)]
struct Counters {
    /// Device frames played from this ring.
    played: AtomicU64,
    /// The decoder has pushed everything it will into this ring.
    eof: AtomicBool,
    /// The callback found the ring empty after `eof`.
    drained: AtomicBool,
    /// The stream failed and must be reopened.
    failed: AtomicBool,
}

/// An open output stream on the default device.
struct Output {
    stream: cpal::Stream,
    rate: u32,
    feed: Arc<Mutex<Feed>>,
    counters: Arc<Counters>,
}

impl Output {
    fn open() -> Result<Self, String> {
        let device = cpal::default_host()
            .default_output_device()
            .ok_or("no audio output device")?;
        let supported = device
            .default_output_config()
            .map_err(|e| format!("audio output: {e}"))?;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let feed = Arc::new(Mutex::new(Feed {
            consumer: None,
            tap: None,
        }));
        let counters = Arc::new(Counters::default());
        let stream = match format {
            cpal::SampleFormat::F32 => build::<f32>(&device, &config, &feed, &counters),
            cpal::SampleFormat::I16 => build::<i16>(&device, &config, &feed, &counters),
            cpal::SampleFormat::I32 => build::<i32>(&device, &config, &feed, &counters),
            cpal::SampleFormat::U16 => build::<u16>(&device, &config, &feed, &counters),
            other => return Err(format!("audio output: unsupported sample format {other}")),
        }?;
        Ok(Self {
            stream,
            rate: config.sample_rate,
            feed,
            counters,
        })
    }

    fn feed(&self) -> std::sync::MutexGuard<'_, Feed> {
        self.feed.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn build<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    feed: &Arc<Mutex<Feed>>,
    counters: &Arc<Counters>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
{
    let channels = usize::from(config.channels).max(1);
    let feed = feed.clone();
    let counters = counters.clone();
    let errors = counters.clone();
    let mut stereo: Vec<f32> = Vec::with_capacity(8192);
    let silence = T::from_sample(0.0f32);
    device
        .build_output_stream::<T, _, _>(
            *config,
            move |data: &mut [T], _| {
                data.fill(silence);
                let Ok(mut feed) = feed.try_lock() else {
                    return;
                };
                let Feed { consumer, tap } = &mut *feed;
                let Some(consumer) = consumer.as_mut() else {
                    return;
                };
                let frames = data.len() / channels;
                let n = (consumer.slots() / 2).min(frames);
                if n > 0
                    && let Ok(chunk) = consumer.read_chunk(n * 2)
                {
                    stereo.clear();
                    let (a, b) = chunk.as_slices();
                    stereo.extend_from_slice(a);
                    stereo.extend_from_slice(b);
                    chunk.commit_all();
                    for (out, lr) in data
                        .chunks_exact_mut(channels)
                        .zip(stereo.as_chunks::<2>().0)
                    {
                        if channels == 1 {
                            out[0] = T::from_sample((lr[0] + lr[1]) * 0.5);
                        } else {
                            out[0] = T::from_sample(lr[0]);
                            out[1] = T::from_sample(lr[1]);
                        }
                    }
                    if let Some(tap) = tap {
                        tap.push_stereo(&stereo);
                    }
                    counters.played.fetch_add(n as u64, Ordering::AcqRel);
                }
                if n < frames && counters.eof.load(Ordering::Acquire) {
                    counters.drained.store(true, Ordering::Release);
                }
            },
            move |e| {
                // Rerouting to a new default device and glitches need nothing.
                if !matches!(
                    e.kind(),
                    cpal::ErrorKind::DeviceChanged | cpal::ErrorKind::Xrun
                ) {
                    errors.failed.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|e| format!("audio output: {e}"))
}

// ------------------------------------------------------------------ worker

struct Job {
    source: Source,
    hub: Arc<VisHub>,
    status: Arc<PlayerStatus>,
    events: Option<PlayerSink>,
    state: PlayerState,
    output: Option<Output>,
    analyzer: Option<Analyzer>,
    producer: Option<rtrb::Producer<f32>>,
    resampler: Option<Stereo>,
    /// Decoded (source rate) and resampled (device rate) samples waiting
    /// for room in the ring.
    decoded: Vec<f32>,
    pending: Vec<f32>,
    /// Position of the current ring's first frame.
    base: Duration,
    last_progress: Instant,
}

impl Job {
    fn new(
        source: Source,
        hub: Arc<VisHub>,
        status: Arc<PlayerStatus>,
        events: Option<PlayerSink>,
    ) -> Self {
        Self {
            source,
            hub,
            status,
            events,
            state: PlayerState::Stopped,
            output: None,
            analyzer: None,
            producer: None,
            resampler: None,
            decoded: Vec::new(),
            pending: Vec::new(),
            base: Duration::ZERO,
            last_progress: Instant::now(),
        }
    }

    fn run(mut self, rx: Receiver<(Command, Reply)>) {
        loop {
            let wait = if self.state == PlayerState::Playing && self.wants_audio() {
                Duration::ZERO
            } else {
                IDLE_WAIT
            };
            match rx.recv_timeout(wait) {
                Ok((command, reply)) => {
                    let result = self.handle(command);
                    let _ = reply.send(result);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if self.state != PlayerState::Playing {
                continue;
            }
            if self
                .output
                .as_ref()
                .is_some_and(|o| o.counters.failed.load(Ordering::Acquire))
            {
                // The device went away or changed format: reopen at the
                // current position on whatever the default is now.
                let at = self.position();
                self.close();
                if let Err(message) = self.open_at(at).and_then(|()| self.start()) {
                    self.fail(message);
                    continue;
                }
            }
            self.fill();
            self.update_position();
            if self
                .output
                .as_ref()
                .is_some_and(|o| o.counters.drained.load(Ordering::Acquire))
            {
                self.finish();
                continue;
            }
            if self.last_progress.elapsed() >= PROGRESS_INTERVAL {
                self.progress();
            }
        }
        self.close();
    }

    fn handle(&mut self, command: Command) -> Result<(), String> {
        match (command, self.state) {
            (Command::Play, PlayerState::Playing) => Ok(()),
            (Command::Play, _) => {
                if self.output.is_none() {
                    let at = self.status.position();
                    self.open_at(at)?;
                }
                self.start().inspect_err(|_| self.close())?;
                self.set_state(PlayerState::Playing);
                self.progress();
                Ok(())
            }
            (Command::Pause, PlayerState::Playing) => {
                self.update_position();
                if let Some(output) = &self.output {
                    let _ = output.stream.pause();
                }
                self.set_state(PlayerState::Paused);
                self.progress();
                Ok(())
            }
            (Command::Pause, state) => Err(format!("can't pause while {state:?}")),
            (Command::Stop, _) => {
                self.rewind();
                Ok(())
            }
            (Command::Seek(at), _) => {
                if self.output.is_some() {
                    self.restart_at(at);
                } else {
                    let reached = self.source.seek(at);
                    self.status
                        .position_ms
                        .store(reached.as_millis() as u64, Ordering::Release);
                }
                self.progress();
                Ok(())
            }
        }
    }

    /// Opens the device and queues audio from `at`, paused.
    fn open_at(&mut self, at: Duration) -> Result<(), String> {
        let output = Output::open()?;
        let (analyzer, tap) = Analyzer::start(self.hub.clone(), output.rate);
        output.feed().tap = Some(tap);
        self.resampler =
            (output.rate != self.source.rate).then(|| Stereo::new(self.source.rate, output.rate));
        self.output = Some(output);
        self.analyzer = Some(analyzer);
        self.restart_at(at);
        Ok(())
    }

    fn start(&mut self) -> Result<(), String> {
        let output = self.output.as_ref().ok_or("no audio output")?;
        output
            .stream
            .play()
            .map_err(|e| format!("audio output: {e}"))
    }

    /// Seeks the decoder and swaps in an empty ring, dropping queued audio.
    fn restart_at(&mut self, at: Duration) {
        self.base = self.source.seek(at);
        self.status
            .position_ms
            .store(self.base.as_millis() as u64, Ordering::Release);
        self.decoded.clear();
        self.pending.clear();
        if let Some(r) = &mut self.resampler {
            r.reset();
        }
        let Some(output) = &self.output else { return };
        let (producer, consumer) = rtrb::RingBuffer::new(RING_FRAMES * 2);
        let mut feed = output.feed();
        feed.consumer = Some(consumer);
        output.counters.played.store(0, Ordering::Release);
        output.counters.eof.store(false, Ordering::Release);
        output.counters.drained.store(false, Ordering::Release);
        drop(feed);
        self.producer = Some(producer);
    }

    fn wants_audio(&self) -> bool {
        !self.source.eof
            && self
                .producer
                .as_ref()
                .is_some_and(|p| p.slots() >= 2 * RESAMPLE_CHUNK * 2)
    }

    /// Decodes until the ring is full (or the file ends).
    fn fill(&mut self) {
        let Some(producer) = self.producer.as_mut() else {
            return;
        };
        loop {
            if !self.pending.is_empty() {
                let n = producer.slots().min(self.pending.len()) & !1;
                if n > 0
                    && let Ok(mut chunk) = producer.write_chunk_uninit(n)
                {
                    let (a, b) = chunk.as_mut_slices();
                    for (slot, s) in a.iter_mut().chain(b.iter_mut()).zip(&self.pending) {
                        slot.write(*s);
                    }
                    // SAFETY: all n slots were just written.
                    unsafe { chunk.commit_all() };
                    self.pending.drain(..n);
                }
                if !self.pending.is_empty() {
                    return;
                }
            }
            if self.source.eof && self.decoded.is_empty() {
                if let Some(output) = &self.output {
                    output.counters.eof.store(true, Ordering::Release);
                }
                return;
            }
            let more = self.source.decode(&mut self.decoded);
            match &mut self.resampler {
                None => self.pending.append(&mut self.decoded),
                Some(r) => r.process(&mut self.decoded, &mut self.pending, !more),
            }
        }
    }

    fn update_position(&mut self) {
        let Some(output) = &self.output else { return };
        let played = output.counters.played.load(Ordering::Acquire);
        let at = self.base + Duration::from_secs_f64(played as f64 / f64::from(output.rate));
        let at = if self.source.duration > Duration::ZERO {
            at.min(self.source.duration)
        } else {
            at
        };
        self.status
            .position_ms
            .store(at.as_millis() as u64, Ordering::Release);
    }

    fn position(&self) -> Duration {
        self.status.position()
    }

    /// The end of the file was heard: stop and rewind.
    fn finish(&mut self) {
        self.rewind();
    }

    fn rewind(&mut self) {
        self.close();
        self.source.seek(Duration::ZERO);
        self.status.position_ms.store(0, Ordering::Release);
        if self.state != PlayerState::Stopped {
            self.set_state(PlayerState::Stopped);
        }
        self.progress();
    }

    fn fail(&mut self, message: String) {
        self.close();
        emit(&self.events, &PlayerEvent::Error { message });
        self.set_state(PlayerState::Paused);
        self.progress();
    }

    /// Releases the device and the visualizer.
    fn close(&mut self) {
        self.producer = None;
        if let Some(output) = self.output.take() {
            let _ = output.stream.pause();
            drop(output);
        }
        self.analyzer = None;
    }

    fn set_state(&mut self, state: PlayerState) {
        self.state = state;
        set_state(&self.status, &self.events, state);
    }

    fn progress(&mut self) {
        self.last_progress = Instant::now();
        let (peak, rms) = if self.analyzer.is_some() {
            self.hub.levels()
        } else {
            Default::default()
        };
        emit_progress(&self.status, &self.events, peak, rms);
    }
}

/// A stereo resampler over interleaved samples.
pub(crate) struct Stereo {
    inner: FftFixedIn<f32>,
    input: [Vec<f32>; 2],
    /// Output frames still to drop to undo the resampler's delay.
    skip: usize,
}

impl Stereo {
    pub(crate) fn new(from: u32, to: u32) -> Self {
        let inner = FftFixedIn::new(from as usize, to as usize, RESAMPLE_CHUNK, 2, 2)
            .expect("valid resampler");
        let skip = inner.output_delay();
        Self {
            inner,
            input: [Vec::new(), Vec::new()],
            skip,
        }
    }

    fn reset(&mut self) {
        self.inner.reset();
        self.input = [Vec::new(), Vec::new()];
        self.skip = self.inner.output_delay();
    }

    /// Consumes `input` (interleaved) and appends resampled frames to `out`;
    /// `flush` pushes out the remainder at the end of the file.
    pub(crate) fn process(&mut self, input: &mut Vec<f32>, out: &mut Vec<f32>, flush: bool) {
        for lr in input.as_chunks::<2>().0 {
            self.input[0].push(lr[0]);
            self.input[1].push(lr[1]);
        }
        input.clear();
        loop {
            let need = self.inner.input_frames_next();
            let result = if self.input[0].len() >= need {
                let block: Vec<Vec<f32>> = self
                    .input
                    .iter_mut()
                    .map(|c| c.drain(..need).collect())
                    .collect();
                self.inner.process(&block, None)
            } else if flush && !self.input[0].is_empty() {
                let block: Vec<Vec<f32>> = self.input.iter_mut().map(std::mem::take).collect();
                self.inner.process_partial(Some(&block), None)
            } else {
                return;
            };
            let Ok(frames) = result else { return };
            for (l, r) in frames[0].iter().zip(&frames[1]) {
                if self.skip > 0 {
                    self.skip -= 1;
                    continue;
                }
                out.push(*l);
                out.push(*r);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_keeps_length() {
        let mut r = Stereo::new(44_100, 48_000);
        let mut input: Vec<f32> = (0..44_100 * 2)
            .map(|i| ((i / 2) as f32 * 0.01).sin())
            .collect();
        let mut out = Vec::new();
        r.process(&mut input, &mut out, true);
        let frames = out.len() / 2;
        assert!((47_000..=49_100).contains(&frames), "{frames} frames");
    }

    #[test]
    fn plays_nothing_when_empty() {
        let mut player = Player::new(VisHub::new());
        assert_eq!(player.state(), PlayerState::Empty);
        assert!(player.play().is_err());
        assert!(player.load(Path::new("/nonexistent.mp3")).is_err());
        assert_eq!(player.state(), PlayerState::Empty);
    }
}

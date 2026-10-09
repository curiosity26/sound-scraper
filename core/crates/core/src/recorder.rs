//! Recorder state machine (docs/design.md §3).
//!
//! ```text
//! Idle --start--> Recording --pause--> Paused --resume--> Recording
//! Recording/Paused --stop--> Finalizing --> Idle
//! ```
//!
//! Audio flows capture → bounded queue → encoder thread → `<name>.mp3.part`.
//! Pausing keeps the capture, encoder and file open and drops incoming audio,
//! so the gap is simply absent from the file. Meanwhile the visualizer's
//! analyzer keeps receiving the audio (paused included) through a
//! non-blocking tap. Stopping flushes the encoder,
//! writes the Xing/LAME tag and ID3 tags, and renames `.part` to `.mp3`.

use std::{
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU8, AtomicU32, AtomicU64, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use sound_scraper_capture::{AudioChunk, CaptureBackend, CaptureSource, Session, default_backend};

use sound_scraper_vis::{Analyzer, Tap, VisHub};

use crate::{
    masters::{self, MasterWriter},
    mp3, paths,
    settings::Quality,
    sources,
    tags::TagVersion,
    trim::SilenceTrimmer,
};

pub const PART_EXT: &str = ".mp3.part";

/// Audio chunks queued between the capture callback and the encoder (~10 ms
/// each), so a slow disk never blocks the real-time thread.
const QUEUE_CHUNKS: usize = 512;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
/// A tap that delivers nothing usually means the capture permission is
/// missing (macOS silently withholds audio); warn once after this long.
const NO_AUDIO_WARNING_AFTER: Duration = Duration::from_secs(3);
pub const NO_AUDIO_MESSAGE: &str = "No audio is arriving from the capture device. On macOS, allow Sound Scraper in \
     System Settings › Privacy & Security › Screen & System Audio Recording.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecorderState {
    Idle,
    Recording,
    Paused,
    Finalizing,
}

impl RecorderState {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Recording,
            2 => Self::Paused,
            3 => Self::Finalizing,
            _ => Self::Idle,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum RecorderEvent {
    StateChanged(RecorderState),
    /// About 10 Hz while recording or paused. Levels are linear (0..=1),
    /// [left, right], from the visualizer's analyzer (so they keep moving
    /// while paused).
    Progress {
        elapsed: Duration,
        peak: [f32; 2],
        rms: [f32; 2],
    },
    Finished {
        path: PathBuf,
    },
    Error {
        message: String,
    },
}

pub type EventSink = Arc<dyn Fn(&RecorderEvent) + Send + Sync>;
pub type BackendFactory = Box<dyn Fn() -> Box<dyn CaptureBackend> + Send>;

#[derive(Debug, Clone)]
pub struct RecorderOptions {
    pub dir: PathBuf,
    pub quality: Quality,
    /// ID3 version for the initial tags.
    pub tag_version: TagVersion,
    /// Drop silence before the first and after the last sound.
    pub trim_silence: bool,
    /// Write a lossless master (in `masters_dir`) under this policy.
    pub master: Option<(PathBuf, masters::Policy)>,
}

impl Default for RecorderOptions {
    fn default() -> Self {
        Self {
            dir: paths::recordings_dir(),
            quality: Quality::default(),
            tag_version: TagVersion::V24,
            trim_silence: true,
            master: None,
        }
    }
}

/// State readable without locking the recorder (e.g. from the UI thread
/// while `stop` runs elsewhere).
#[derive(Default)]
pub struct Status {
    state: AtomicU8,
    frames: AtomicU64,
    sample_rate: AtomicU32,
    vis: Arc<VisHub>,
}

impl Status {
    /// The visualizer's analysis of the recording's audio.
    pub fn vis(&self) -> Arc<VisHub> {
        self.vis.clone()
    }

    pub fn state(&self) -> RecorderState {
        RecorderState::from_u8(self.state.load(Ordering::Acquire))
    }

    /// Recorded time, excluding pauses.
    pub fn elapsed(&self) -> Duration {
        match self.sample_rate.load(Ordering::Acquire) {
            0 => Duration::ZERO,
            rate => Duration::from_secs_f64(
                self.frames.load(Ordering::Acquire) as f64 / f64::from(rate),
            ),
        }
    }
}

pub struct Recorder {
    options: RecorderOptions,
    backend_factory: BackendFactory,
    events: Option<EventSink>,
    status: Arc<Status>,
    active: Option<Active>,
}

struct Active {
    backend: Box<dyn CaptureBackend>,
    session: Session,
    paused: Arc<AtomicBool>,
    worker: JoinHandle<Result<PathBuf, String>>,
}

impl Recorder {
    pub fn new() -> Self {
        Self::with_backend(RecorderOptions::default(), Box::new(default_backend))
    }

    pub fn with_backend(options: RecorderOptions, backend_factory: BackendFactory) -> Self {
        Self {
            options,
            backend_factory,
            events: None,
            status: Arc::default(),
            active: None,
        }
    }

    /// Folder and quality for the next recording (ignored while one runs).
    pub fn set_options(&mut self, options: RecorderOptions) {
        self.options = options;
    }

    pub fn set_event_sink(&mut self, sink: Option<EventSink>) {
        self.events = sink;
    }

    pub fn state(&self) -> RecorderState {
        self.status.state()
    }

    pub fn status(&self) -> Arc<Status> {
        self.status.clone()
    }

    pub fn start(&mut self, source: CaptureSource) -> Result<(), String> {
        if self.state() != RecorderState::Idle {
            return Err(format!("can't start while {:?}", self.state()));
        }
        let label = sources::source_label(&source);
        let name = paths::default_name(&label, chrono::Local::now());
        let dir = self.options.dir.clone();
        std::fs::create_dir_all(&dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
        let part = paths::unique_path(&dir, &name, PART_EXT, &[".mp3"]);
        let file =
            File::create_new(&part).map_err(|e| format!("creating {}: {e}", part.display()))?;

        let (tx, rx) = mpsc::sync_channel(QUEUE_CHUNKS);
        let mut backend = (self.backend_factory)();
        let session = match backend.start(source.clone(), tx) {
            Ok(session) => session,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&part);
                return Err(e.to_string());
            }
        };

        self.status.frames.store(0, Ordering::Release);
        self.status.sample_rate.store(0, Ordering::Release);
        let paused = Arc::new(AtomicBool::new(false));
        let job = EncodeJob {
            rx,
            file: BufWriter::new(file),
            part,
            title: part_stem(&name),
            comment: match &source {
                CaptureSource::App { app } => Some(format!("Recorded from {}", app.name)),
                CaptureSource::System { .. } => None,
            },
            quality: self.options.quality,
            tag_version: self.options.tag_version,
            trim_silence: self.options.trim_silence,
            master_options: self.options.master.clone(),
            master: None,
            paused: paused.clone(),
            status: self.status.clone(),
            events: self.events.clone(),
        };
        let worker = std::thread::Builder::new()
            .name("sound-scraper-encoder".into())
            .spawn(move || job.run())
            .map_err(|e| e.to_string())?;

        self.active = Some(Active {
            backend,
            session,
            paused,
            worker,
        });
        self.set_state(RecorderState::Recording);
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), String> {
        match (&self.active, self.state()) {
            (Some(active), RecorderState::Recording) => {
                active.paused.store(true, Ordering::Release);
                self.set_state(RecorderState::Paused);
                Ok(())
            }
            (_, state) => Err(format!("can't pause while {state:?}")),
        }
    }

    pub fn resume(&mut self) -> Result<(), String> {
        match (&self.active, self.state()) {
            (Some(active), RecorderState::Paused) => {
                active.paused.store(false, Ordering::Release);
                self.set_state(RecorderState::Recording);
                Ok(())
            }
            (_, state) => Err(format!("can't resume while {state:?}")),
        }
    }

    /// Stops and finalizes; returns the finished `.mp3` path.
    pub fn stop(&mut self) -> Result<PathBuf, String> {
        let state = self.state();
        if !matches!(state, RecorderState::Recording | RecorderState::Paused) {
            return Err(format!("can't stop while {state:?}"));
        }
        let Active {
            mut backend,
            session,
            paused,
            worker,
        } = self.active.take().expect("active session");
        paused.store(true, Ordering::Release);
        self.set_state(RecorderState::Finalizing);
        // Dropping the capture's sender ends the encoder loop once it drains.
        backend.stop(session);
        let result = worker
            .join()
            .unwrap_or_else(|_| Err("encoder thread panicked".into()));
        match &result {
            Ok(path) => self.emit(&RecorderEvent::Finished { path: path.clone() }),
            Err(message) => self.emit(&RecorderEvent::Error {
                message: message.clone(),
            }),
        }
        self.set_state(RecorderState::Idle);
        result
    }

    fn set_state(&self, state: RecorderState) {
        self.status.state.store(state as u8, Ordering::Release);
        self.emit(&RecorderEvent::StateChanged(state));
    }

    fn emit(&self, event: &RecorderEvent) {
        if let Some(sink) = &self.events {
            sink(event);
        }
    }
}

impl Default for Recorder {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Recorder {
    fn drop(&mut self) {
        if self.active.is_some() {
            let _ = self.stop();
        }
    }
}

/// The encoder thread's half of a recording.
struct EncodeJob {
    rx: Receiver<AudioChunk>,
    file: BufWriter<File>,
    part: PathBuf,
    title: String,
    comment: Option<String>,
    quality: Quality,
    tag_version: TagVersion,
    trim_silence: bool,
    master_options: Option<(PathBuf, masters::Policy)>,
    /// The lossless master, from the first audio; dropped on a write error.
    master: Option<MasterWriter>,
    paused: Arc<AtomicBool>,
    status: Arc<Status>,
    events: Option<EventSink>,
}

impl EncodeJob {
    fn run(mut self) -> Result<PathBuf, String> {
        let result = self.encode_until_disconnected();
        let elapsed = self.status.elapsed();
        let EncodeJob {
            file,
            part,
            title,
            comment,
            tag_version,
            master,
            master_options,
            ..
        } = self;
        let finalized = result.and_then(|encoder| {
            finalize(
                file,
                &part,
                encoder,
                &title,
                comment.as_deref(),
                tag_version,
            )
        });
        if finalized.is_err()
            && std::fs::metadata(&part)
                .map(|m| m.len() == 0)
                .unwrap_or(false)
        {
            let _ = std::fs::remove_file(&part);
        }
        // The master is kept for long recordings only, and never fails the
        // recording.
        if let (Some(master), Some((_, policy))) = (master, master_options) {
            match &finalized {
                Ok(path) if policy.keep && elapsed >= policy.min_length => {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    let _ = master.finish(&name);
                    masters::cleanup(&policy);
                }
                _ => master.discard(),
            }
        }
        finalized
    }

    fn encode_until_disconnected(&mut self) -> Result<Option<mp3::Mp3Encoder>, String> {
        let mut encoder: Option<mp3::Mp3Encoder> = None;
        let mut stereo = Vec::new();
        // With trimming, what's left of each chunk to encode now.
        let mut kept = Vec::new();
        let mut trimmer: Option<SilenceTrimmer> = None;
        let mut encoded_frames = 0u64;
        // Started with the first audio (it needs the sample rate); stops,
        // clearing the visualizer, when this job ends.
        let mut analysis: Option<(Analyzer, Tap)> = None;
        let started = Instant::now();
        let mut last_progress = started;
        let (mut any_audio, mut warned) = (false, false);
        loop {
            let received = self.rx.recv_timeout(PROGRESS_INTERVAL);
            any_audio |= received.is_ok();
            if !any_audio && !warned && started.elapsed() >= NO_AUDIO_WARNING_AFTER {
                warned = true;
                if let Some(sink) = &self.events {
                    sink(&RecorderEvent::Error {
                        message: NO_AUDIO_MESSAGE.into(),
                    });
                }
            }
            if let Ok(chunk) = &received {
                to_stereo(chunk, &mut stereo);
                let (_, tap) = analysis.get_or_insert_with(|| {
                    Analyzer::start(self.status.vis.clone(), chunk.sample_rate)
                });
                tap.push_stereo(&stereo);
            }
            match received {
                Ok(chunk) if !self.paused.load(Ordering::Acquire) => {
                    let audio = if self.trim_silence {
                        kept.clear();
                        trimmer
                            .get_or_insert_with(|| SilenceTrimmer::new(chunk.sample_rate))
                            .push(&stereo, &mut kept);
                        &kept
                    } else {
                        &stereo
                    };
                    encoded_frames += self.encode(&mut encoder, chunk.sample_rate, audio)?;
                    // Held-back silence counts: it's kept if audio resumes.
                    let held = trimmer.as_ref().map_or(0, SilenceTrimmer::held_frames);
                    self.status
                        .frames
                        .store(encoded_frames + held, Ordering::Release);
                }
                Ok(_paused_chunk) => {}
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    if let Some(mut trimmer) = trimmer {
                        if !trimmer.heard_audio() {
                            return Err("only silence was recorded".into());
                        }
                        kept.clear();
                        trimmer.finish(&mut kept);
                        let rate = self.status.sample_rate.load(Ordering::Acquire);
                        encoded_frames += self.encode(&mut encoder, rate, &kept)?;
                        self.status.frames.store(encoded_frames, Ordering::Release);
                    }
                    return Ok(encoder);
                }
            }
            if last_progress.elapsed() >= PROGRESS_INTERVAL {
                last_progress = Instant::now();
                let (peak, rms) = self.status.vis.levels();
                if let Some(sink) = &self.events {
                    sink(&RecorderEvent::Progress {
                        elapsed: self.status.elapsed(),
                        peak,
                        rms,
                    });
                }
            }
        }
    }
}

impl EncodeJob {
    /// Encodes stereo audio, starting the encoder on first use; returns
    /// the frames written.
    fn encode(
        &mut self,
        encoder: &mut Option<mp3::Mp3Encoder>,
        sample_rate: u32,
        stereo: &[f32],
    ) -> Result<u64, String> {
        if stereo.is_empty() {
            return Ok(0);
        }
        if encoder.is_none() {
            *encoder = Some(mp3::Mp3Encoder::new(sample_rate, self.quality)?);
            self.status
                .sample_rate
                .store(sample_rate, Ordering::Release);
        }
        let bytes = encoder.as_mut().unwrap().encode(stereo)?;
        self.file
            .write_all(bytes)
            .map_err(|e| format!("writing {}: {e}", self.part.display()))?;
        self.write_master(sample_rate, stereo);
        Ok((stereo.len() / 2) as u64)
    }

    /// Feeds the lossless master (started on first use, if enabled).
    fn write_master(&mut self, sample_rate: u32, stereo: &[f32]) {
        let Some((dir, policy)) = &self.master_options else {
            return;
        };
        if !policy.keep {
            return;
        }
        if self.master.is_none() {
            let name = self.part.file_name().unwrap_or_default().to_string_lossy();
            match MasterWriter::create(dir, &name, sample_rate) {
                Ok(m) => self.master = Some(m),
                Err(_) => {
                    // No master this time; the recording goes on.
                    self.master_options = None;
                    return;
                }
            }
        }
        if let Some(master) = &mut self.master
            && master.push(stereo).is_err()
        {
            self.master.take().unwrap().discard();
            self.master_options = None;
        }
    }
}

fn finalize(
    mut file: BufWriter<File>,
    part: &Path,
    encoder: Option<mp3::Mp3Encoder>,
    title: &str,
    comment: Option<&str>,
    tag_version: TagVersion,
) -> Result<PathBuf, String> {
    let io_err = |e: std::io::Error| format!("finalizing {}: {e}", part.display());
    let Some(mut encoder) = encoder else {
        drop(file);
        let _ = std::fs::remove_file(part);
        return Err("no audio was recorded".into());
    };
    file.write_all(encoder.flush()?).map_err(io_err)?;
    file.into_inner()
        .map_err(|e| io_err(e.into_error()))?
        .sync_all()
        .map_err(io_err)?;
    if let Some(tag) = encoder.lame_tag() {
        mp3::write_first_frame(part, &tag).map_err(io_err)?;
    }
    write_tags(part, title, comment, false, tag_version)?;
    publish(part)
}

/// Initial ID3v2.4 tags (docs/design.md §3, §6).
fn write_tags(
    path: &Path,
    title: &str,
    comment: Option<&str>,
    recovered: bool,
    version: TagVersion,
) -> Result<(), String> {
    use id3::{Tag, TagLike, Timestamp, Version, frame::Comment};
    let now = chrono::Local::now();
    let mut tag = Tag::new();
    tag.set_title(title);
    tag.set_date_recorded(Timestamp {
        year: now.format("%Y").to_string().parse().unwrap_or(1970),
        month: now.format("%m").to_string().parse().ok(),
        day: now.format("%d").to_string().parse().ok(),
        hour: now.format("%H").to_string().parse().ok(),
        minute: now.format("%M").to_string().parse().ok(),
        second: None,
    });
    tag.set_text("TSSE", format!("Sound Scraper {}", crate::VERSION));
    let comment = match (comment, recovered) {
        (Some(c), true) => Some(format!("{c} (recovered after an interrupted recording)")),
        (None, true) => Some("Recovered after an interrupted recording".to_string()),
        (c, false) => c.map(str::to_string),
    };
    if let Some(text) = comment {
        tag.add_frame(Comment {
            lang: "eng".into(),
            description: String::new(),
            text,
        });
    }
    let version = match version {
        TagVersion::V24 => Version::Id3v24,
        TagVersion::V23 => {
            // v2.3 has no TDRC: keep the year in TYER.
            if let Some(ts) = tag.date_recorded() {
                tag.remove_date_recorded();
                tag.set_year(ts.year);
            }
            Version::Id3v23
        }
    };
    tag.write_to_path(path, version)
        .map_err(|e| format!("writing tags to {}: {e}", path.display()))
}

/// Renames `<name>.mp3.part` to a free `<name>.mp3`.
fn publish(part: &Path) -> Result<PathBuf, String> {
    let dir = part.parent().unwrap_or(Path::new("."));
    let stem = part_stem(&part.file_name().unwrap_or_default().to_string_lossy());
    let target = paths::unique_path(dir, &stem, ".mp3", &[]);
    std::fs::rename(part, &target).map_err(|e| format!("renaming {}: {e}", part.display()))?;
    Ok(target)
}

fn part_stem(file_name: &str) -> String {
    file_name
        .strip_suffix(PART_EXT)
        .unwrap_or(file_name)
        .to_string()
}

/// Finishes `.mp3.part` files left by a crash in `dir`: trims a truncated
/// final frame, writes a duration header, tags and renames them. Call before
/// starting a recording (a live recording's `.part` must not be touched).
pub fn recover_partials(dir: &Path, version: TagVersion) -> Vec<Result<PathBuf, String>> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut parts: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().ends_with(PART_EXT))
        })
        .collect();
    parts.sort();
    parts
        .into_iter()
        .map(|part| {
            let title = part_stem(&part.file_name().unwrap().to_string_lossy());
            match mp3::repair(&part) {
                Ok(scan) if scan.frames > 1 => {
                    write_tags(&part, &title, None, true, version)?;
                    publish(&part)
                }
                Ok(_) | Err(_) => {
                    // Nothing playable (e.g. crashed before the first frame).
                    let _ = std::fs::remove_file(&part);
                    Err(format!("{} held no audio and was removed", part.display()))
                }
            }
        })
        .collect()
}

/// Converts a chunk to interleaved stereo (mono is duplicated; extra
/// channels are folded into left/right by even/odd index).
fn to_stereo(chunk: &AudioChunk, out: &mut Vec<f32>) {
    out.clear();
    match chunk.channels {
        0 => {}
        1 => out.extend(chunk.samples.iter().flat_map(|&s| [s, s])),
        2 => out.extend_from_slice(&chunk.samples),
        n => {
            let n = n as usize;
            for frame in chunk.samples.chunks_exact(n) {
                let (mut l, mut r) = (0.0, 0.0);
                for (i, s) in frame.iter().enumerate() {
                    if i % 2 == 0 { l += s } else { r += s }
                }
                let (nl, nr) = (n.div_ceil(2) as f32, (n / 2) as f32);
                out.extend([l / nl, r / nr]);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, mpsc::SyncSender};

    use sound_scraper_capture::{AppTarget, CaptureError, OutputDevice};

    use super::*;
    use crate::mp3::tests::sine;

    /// Starts but never delivers audio, like a tap without permission.
    struct SilentBackend;

    impl CaptureBackend for SilentBackend {
        fn list_outputs(&self) -> Vec<OutputDevice> {
            Vec::new()
        }
        fn list_audio_apps(&self) -> Vec<AppTarget> {
            Vec::new()
        }
        fn start(
            &mut self,
            _: CaptureSource,
            sink: SyncSender<AudioChunk>,
        ) -> Result<Session, CaptureError> {
            std::mem::forget(sink); // keep the channel open, send nothing
            Ok(Session { id: 1 })
        }
        fn stop(&mut self, _: Session) {}
    }

    /// Plays a 440 Hz tone in real time, 10 ms per chunk; chunks for which
    /// `audible(n)` is false are silent.
    struct ToneBackend {
        rate: u32,
        channels: u16,
        audible: fn(u32) -> bool,
        stop: Arc<AtomicBool>,
        thread: Option<JoinHandle<()>>,
    }

    impl ToneBackend {
        fn factory(rate: u32, channels: u16) -> BackendFactory {
            Self::pattern(rate, channels, |_| true)
        }

        fn pattern(rate: u32, channels: u16, audible: fn(u32) -> bool) -> BackendFactory {
            Box::new(move || {
                Box::new(ToneBackend {
                    rate,
                    channels,
                    audible,
                    stop: Arc::default(),
                    thread: None,
                }) as Box<dyn CaptureBackend>
            })
        }
    }

    impl CaptureBackend for ToneBackend {
        fn list_outputs(&self) -> Vec<OutputDevice> {
            Vec::new()
        }
        fn list_audio_apps(&self) -> Vec<AppTarget> {
            Vec::new()
        }
        fn start(
            &mut self,
            _: CaptureSource,
            sink: SyncSender<AudioChunk>,
        ) -> Result<Session, CaptureError> {
            let (rate, channels, audible, stop) =
                (self.rate, self.channels, self.audible, self.stop.clone());
            self.thread = Some(std::thread::spawn(move || {
                let tone = sine(0.01, rate);
                let samples: Vec<f32> = match channels {
                    1 => tone.iter().step_by(2).copied().collect(),
                    _ => tone,
                };
                // Paced against the clock (not a fixed sleep) so it stays real-time under load.
                let start = Instant::now();
                for n in 1u32.. {
                    if stop.load(Ordering::Acquire) {
                        break;
                    }
                    let samples = if audible(n) {
                        samples.clone()
                    } else {
                        vec![0.0; samples.len()]
                    };
                    let _ = sink.try_send(AudioChunk {
                        samples,
                        sample_rate: rate,
                        channels,
                    });
                    let next = start + Duration::from_millis(10) * n;
                    std::thread::sleep(next.saturating_duration_since(Instant::now()));
                }
            }));
            Ok(Session { id: 1 })
        }
        fn stop(&mut self, _: Session) {
            self.stop.store(true, Ordering::Release);
            if let Some(t) = self.thread.take() {
                t.join().unwrap();
            }
        }
    }

    fn recorder(dir: &Path) -> (Recorder, Arc<Mutex<Vec<RecorderEvent>>>) {
        let mut r = Recorder::with_backend(
            RecorderOptions {
                dir: dir.to_owned(),
                quality: Quality::Cbr192,
                tag_version: TagVersion::V24,
                trim_silence: false,
                master: None,
            },
            ToneBackend::factory(48000, 2),
        );
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        r.set_event_sink(Some(Arc::new(move |e: &RecorderEvent| {
            sink.lock().unwrap().push(e.clone())
        })));
        (r, events)
    }

    fn system() -> CaptureSource {
        CaptureSource::System { device: None }
    }

    #[test]
    fn pause_excludes_paused_time_and_finalizes() {
        let dir = crate::paths::tempdir();
        let (mut r, events) = recorder(&dir);
        // Wall time spent recording; sleeps overshoot on a busy machine, so
        // the duration check compares against this rather than the 1.2 s asked for.
        let started = std::time::Instant::now();
        r.start(system()).unwrap();
        std::thread::sleep(Duration::from_millis(600));
        let vis = r.status().vis();
        assert!(vis.is_active(), "the analyzer runs while recording");
        r.pause().unwrap();
        let mut recorded = started.elapsed();
        let elapsed_at_pause = r.status().elapsed();
        std::thread::sleep(Duration::from_millis(700));
        assert!(
            r.status().elapsed() - elapsed_at_pause < Duration::from_millis(30),
            "time advanced while paused"
        );
        assert!(
            vis.is_active() && vis.levels().0[0] > 0.1,
            "the analyzer keeps going while paused"
        );
        let resumed = std::time::Instant::now();
        r.resume().unwrap();
        std::thread::sleep(Duration::from_millis(600));
        let path = r.stop().unwrap();
        recorded += resumed.elapsed();
        assert!(!vis.is_active(), "the analyzer stops with the recording");

        assert_eq!(path.extension().unwrap(), "mp3");
        assert!(
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("System audio ")
        );
        assert!(
            std::fs::read_dir(&dir).unwrap().all(|e| !e
                .unwrap()
                .path()
                .to_string_lossy()
                .ends_with(PART_EXT))
        );

        let scan = mp3::scan(&path).unwrap();
        assert!(scan.has_info_tag, "Xing/LAME tag missing");
        let d = scan.duration_secs();
        let recorded = recorded.as_secs_f64();
        assert!(
            d >= 1.05 && (d - recorded).abs() < 0.25,
            "duration {d:.2}s should match the {recorded:.2}s recorded, excluding the 0.7s pause"
        );

        let tag = id3::Tag::read_from_path(&path).unwrap();
        use id3::TagLike;
        assert_eq!(
            tag.title(),
            Some(path.file_stem().unwrap().to_str().unwrap())
        );
        assert!(tag.get("TSSE").is_some() && tag.date_recorded().is_some());

        let events = events.lock().unwrap();
        let states: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                RecorderEvent::StateChanged(s) => Some(*s),
                _ => None,
            })
            .collect();
        use RecorderState::*;
        assert_eq!(states, [Recording, Paused, Recording, Finalizing, Idle]);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, RecorderEvent::Progress { peak, .. } if peak[0] > 0.4))
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, RecorderEvent::Finished { .. }))
        );
    }

    #[test]
    fn trims_leading_and_trailing_silence() {
        let dir = crate::paths::tempdir();
        let options = |trim_silence| RecorderOptions {
            dir: dir.clone(),
            quality: Quality::Cbr192,
            tag_version: TagVersion::V24,
            trim_silence,
            master: None,
        };
        // 0.5 s of silence, then 0.6 s of tone, then silence.
        let audible: fn(u32) -> bool = |n| (51..=110).contains(&n);
        let record = |trim| {
            let mut r =
                Recorder::with_backend(options(trim), ToneBackend::pattern(48000, 2, audible));
            r.start(system()).unwrap();
            std::thread::sleep(Duration::from_millis(1600));
            mp3::scan(&r.stop().unwrap()).unwrap().duration_secs()
        };
        let trimmed = record(true);
        assert!(
            (0.7..=0.95).contains(&trimmed),
            "trimmed duration {trimmed:.2}s should be the tone plus margins"
        );
        let full = record(false);
        assert!(full >= 1.5, "untrimmed duration {full:.2}s");
    }

    #[test]
    fn long_recordings_keep_a_lossless_master_matching_the_mp3() {
        let dir = crate::paths::tempdir();
        let masters_dir = dir.join("Masters");
        let options = |min_secs| RecorderOptions {
            dir: dir.clone(),
            quality: Quality::Cbr192,
            tag_version: TagVersion::V24,
            trim_silence: true,
            master: Some((
                masters_dir.clone(),
                masters::Policy {
                    min_length: Duration::from_secs(min_secs),
                    ..Default::default()
                },
            )),
        };
        let audible: fn(u32) -> bool = |n| (21..=80).contains(&n);
        let record = |min_secs| {
            let mut r =
                Recorder::with_backend(options(min_secs), ToneBackend::pattern(48000, 2, audible));
            r.start(system()).unwrap();
            std::thread::sleep(Duration::from_millis(1100));
            r.stop().unwrap()
        };
        let mp3 = record(0);
        let master = masters::path_for(&masters_dir, &mp3.file_name().unwrap().to_string_lossy());
        assert!(master.is_file(), "kept: {}", master.display());
        let frames = |p: &Path| crate::player::Source::open(p).unwrap().n_frames.unwrap();
        assert_eq!(
            frames(&master),
            frames(&mp3),
            "the master and the MP3 line up sample for sample"
        );
        assert!(
            std::fs::read_dir(&masters_dir).unwrap().all(|e| !e
                .unwrap()
                .path()
                .to_string_lossy()
                .ends_with(".part"))
        );

        let short = record(3600);
        assert!(
            !masters::path_for(&masters_dir, &short.file_name().unwrap().to_string_lossy())
                .exists(),
            "short: dropped"
        );
    }

    #[test]
    fn only_silence_leaves_no_file_when_trimming() {
        let dir = crate::paths::tempdir();
        let options = RecorderOptions {
            dir: dir.clone(),
            quality: Quality::Cbr192,
            tag_version: TagVersion::V24,
            trim_silence: true,
            master: None,
        };
        let mut r = Recorder::with_backend(options, ToneBackend::pattern(48000, 2, |_| false));
        r.start(system()).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(r.stop().unwrap_err(), "only silence was recorded");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn rejects_invalid_transitions() {
        let dir = crate::paths::tempdir();
        let (mut r, _) = recorder(&dir);
        assert!(r.pause().is_err());
        assert!(r.resume().is_err());
        assert!(r.stop().is_err());
        r.start(system()).unwrap();
        assert!(r.start(system()).is_err());
        assert!(r.resume().is_err());
        std::thread::sleep(Duration::from_millis(100));
        r.stop().unwrap();
        assert_eq!(r.state(), RecorderState::Idle);
    }

    #[test]
    fn stopping_before_any_audio_leaves_no_file() {
        let dir = crate::paths::tempdir();
        let mut r = Recorder::with_backend(
            RecorderOptions {
                dir: dir.clone(),
                quality: Quality::Cbr192,
                tag_version: TagVersion::V24,
                trim_silence: false,
                master: None,
            },
            ToneBackend::factory(48000, 2),
        );
        r.start(system()).unwrap();
        r.pause().unwrap(); // everything arriving is dropped
        std::thread::sleep(Duration::from_millis(50));
        assert!(r.stop().is_err());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn warns_when_no_audio_arrives() {
        let dir = crate::paths::tempdir();
        let mut r = Recorder::with_backend(
            RecorderOptions {
                dir,
                quality: Quality::Cbr192,
                tag_version: TagVersion::V24,
                trim_silence: false,
                master: None,
            },
            Box::new(|| Box::new(SilentBackend) as Box<dyn CaptureBackend>),
        );
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        r.set_event_sink(Some(Arc::new(move |e: &RecorderEvent| {
            if let RecorderEvent::Error { message } = e {
                let _ = tx.lock().unwrap().send(message.clone());
            }
        })));
        r.start(system()).unwrap();
        let message = rx
            .recv_timeout(NO_AUDIO_WARNING_AFTER + Duration::from_secs(1))
            .unwrap();
        assert_eq!(message, NO_AUDIO_MESSAGE);
        // The sender is leaked, so finalizing would wait forever; the worker
        // is left running and the recorder forgotten to end the test.
        std::mem::forget(r);
    }

    #[test]
    fn recovers_an_interrupted_recording() {
        let dir = crate::paths::tempdir();
        let mut data = mp3::tests::encode_all(&sine(1.5, 48000), 48000, false);
        data.truncate(data.len() - 200); // crash mid-frame
        std::fs::write(dir.join("Music 2026-10-03 14-05.mp3.part"), &data).unwrap();
        std::fs::write(dir.join("Empty 2026-10-03 14-06.mp3.part"), b"").unwrap();

        let results = recover_partials(&dir, TagVersion::V24);
        assert_eq!(results.len(), 2);
        let recovered = results.iter().find_map(|r| r.as_ref().ok()).unwrap();
        assert_eq!(recovered, &dir.join("Music 2026-10-03 14-05.mp3"));
        let scan = mp3::scan(recovered).unwrap();
        assert!(scan.has_info_tag);
        assert!(
            (scan.duration_secs() - 1.5).abs() < 0.1,
            "duration {}",
            scan.duration_secs()
        );
        use id3::TagLike;
        let tag = id3::Tag::read_from_path(recovered).unwrap();
        assert_eq!(tag.title(), Some("Music 2026-10-03 14-05"));
        assert!(!dir.join("Empty 2026-10-03 14-06.mp3.part").exists());
    }

    #[test]
    fn downmixes_to_stereo() {
        let mut out = Vec::new();
        to_stereo(
            &AudioChunk {
                samples: vec![0.5, -0.5],
                sample_rate: 48000,
                channels: 1,
            },
            &mut out,
        );
        assert_eq!(out, [0.5, 0.5, -0.5, -0.5]);
        // 4 channels: L = mean(ch0, ch2), R = mean(ch1, ch3)
        to_stereo(
            &AudioChunk {
                samples: vec![1.0, 0.0, 0.0, 1.0],
                sample_rate: 48000,
                channels: 4,
            },
            &mut out,
        );
        assert_eq!(out, [0.5, 0.5]);
    }
}

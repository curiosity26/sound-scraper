//! Burn jobs (docs/playlists-and-cd-burning-design.md §6, §7): turn a
//! playlist's recordings into CD audio, then hand the prepared disc to a
//! burner (an image, the simulated recorder, later the OS's), keeping a
//! status the UI polls: per-track state and progress, the phase, speed,
//! buffer and a log.

use std::{
    collections::HashMap,
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use serde::{Deserialize, Serialize};
use sound_scraper_disc::{
    self as disc, BurnEvent, Burner, Device, PreparedDisc, SAMPLE_RATE, TrackInfo, WriteOptions,
    image::ImageBurner,
    sim::{SimBurner, SimSettings},
};

use crate::player::{Source, Stereo};

/// One recording to burn, as the UI knows it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BurnTrack {
    pub path: String,
    pub title: String,
    #[serde(default)]
    pub performer: Option<String>,
    /// From the library, for progress while decoding.
    #[serde(default)]
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BurnRequest {
    pub device_id: String,
    /// The album title (the playlist's name).
    pub title: String,
    #[serde(default)]
    pub performer: Option<String>,
    pub tracks: Vec<BurnTrack>,
    #[serde(default = "two")]
    pub gap_seconds: u32,
    #[serde(default = "yes")]
    pub cd_text: bool,
    #[serde(default)]
    pub test_write: bool,
    #[serde(default)]
    pub speed: u32,
    #[serde(default = "yes")]
    pub eject: bool,
    #[serde(default)]
    pub erase: bool,
    /// For the image: the `.cue` to write.
    #[serde(default)]
    pub image_path: Option<String>,
}

fn two() -> u32 {
    2
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackStatus {
    pub title: String,
    pub duration_ms: u64,
    /// "waiting" | "preparing" | "ready" | "writing" | "done" | "failed"
    pub state: &'static str,
    /// 0..1 through the current step (decoding, then writing).
    pub progress: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub at_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// "preparing" | "writing" | "done" | "failed" | "cancelled"
    pub state: &'static str,
    /// What's happening, in words ("Writing track 3 of 12").
    pub phase: String,
    pub destination: String,
    /// "image" | "simulated" | "drive"
    pub kind: String,
    pub tracks: Vec<TrackStatus>,
    /// 0..1 over the whole job.
    pub overall: f64,
    pub elapsed_ms: u64,
    /// Estimated, once writing has a speed.
    pub remaining_ms: Option<u64>,
    pub speed_x: Option<f64>,
    /// 0..1, when the drive reports it.
    pub buffer: Option<f64>,
    pub log: Vec<LogLine>,
    /// Why it failed.
    pub message: Option<String>,
    /// The image written (or the simulator's record of the burn).
    pub output: Option<String>,
    pub test_write: bool,
}

struct Job {
    status: Mutex<Status>,
    cancel: AtomicBool,
    started: Instant,
}

impl Job {
    fn update(&self, f: impl FnOnce(&mut Status)) {
        let mut s = self.status.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut s);
        s.elapsed_ms = self.started.elapsed().as_millis() as u64;
    }

    fn log(&self, text: impl Into<String>) {
        let at_ms = self.started.elapsed().as_millis() as u64;
        self.update(|s| {
            s.log.push(LogLine {
                at_ms,
                text: text.into(),
            })
        });
    }
}

/// Running and finished jobs by id, and the next id.
type Jobs = (u64, HashMap<u64, Arc<Job>>);
static JOBS: Mutex<Option<Jobs>> = Mutex::new(None);

/// Whether the simulated recorder is offered: Debug builds, or
/// `SS_SIMULATED_BURNER=1`.
pub fn simulator_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var("SS_SIMULATED_BURNER").is_ok_and(|v| v == "1")
}

/// Where burns are prepared (CD audio, up to ~850 MB) and the simulator's
/// record is kept.
fn work_dir() -> PathBuf {
    std::env::temp_dir().join(format!("Sound Scraper burn {}", std::process::id()))
}

/// What can be burned to: CD writers the OS reports (phase 3), the
/// simulated recorder when enabled, and a disc image (always, last).
pub fn devices() -> Vec<Device> {
    let mut list = cached_drives();
    if simulator_enabled() {
        list.push(disc::sim::device());
    }
    list.push(disc::image::device());
    list
}

/// The drives, as last seen by a background thread that looks every two
/// seconds while the UI keeps asking (asking a drive about its disc can
/// take a while, and the UI asks from its own thread).
fn cached_drives() -> Vec<Device> {
    use std::time::Duration;
    struct Cache {
        drives: Option<Vec<Device>>,
        asked: Instant,
        running: bool,
    }
    static CACHE: Mutex<Option<Cache>> = Mutex::new(None);
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = guard.get_or_insert_with(|| Cache { drives: None, asked: Instant::now(), running: false });
    cache.asked = Instant::now();
    if !cache.running {
        cache.running = true;
        let _ = std::thread::Builder::new().name("cd drives".into()).spawn(|| {
            loop {
                let drives = disc::drives();
                let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
                let cache = guard.as_mut().unwrap();
                cache.drives = Some(drives);
                // Stop when nobody has asked for a while.
                if cache.asked.elapsed() > Duration::from_secs(20) {
                    cache.running = false;
                    return;
                }
                drop(guard);
                std::thread::sleep(Duration::from_secs(2));
            }
        });
    }
    match &cache.drives {
        Some(d) => d.clone(),
        None => {
            drop(guard);
            // The first time: wait for the first look (briefly).
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(50));
                if let Some(d) = CACHE.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|c| c.drives.clone()) {
                    return d;
                }
            }
            Vec::new()
        }
    }
}

fn burner_for(device_id: &str) -> Result<(Box<dyn Burner>, Device), String> {
    match device_id {
        "image" => Ok((Box::new(ImageBurner), disc::image::device())),
        "sim" if simulator_enabled() => Ok((
            Box::new(SimBurner {
                dir: work_dir().join("simulated"),
            }),
            disc::sim::device(),
        )),
        id => {
            let device = disc::drives()
                .into_iter()
                .find(|d| d.id == id)
                .ok_or("That CD recorder isn't connected any more.")?;
            let burner = disc::drive_burner(id).ok_or("CD burning isn't available on this system.")?;
            Ok((burner, device))
        }
    }
}

/// Starts a burn on its own thread; returns the job id to poll.
pub fn start(request: BurnRequest) -> Result<u64, String> {
    let (burner, device) = burner_for(&request.device_id)?;
    if request.tracks.is_empty() {
        return Err("There's nothing to burn.".into());
    }
    if request.tracks.len() > disc::MAX_TRACKS {
        return Err(format!("A CD holds at most {} tracks.", disc::MAX_TRACKS));
    }
    if device.kind == "image" && request.image_path.is_none() {
        return Err("Choose where to save the image.".into());
    }
    let job = Arc::new(Job {
        status: Mutex::new(Status {
            state: "preparing",
            phase: "Preparing tracks".into(),
            destination: device.name.clone(),
            kind: device.kind.clone(),
            tracks: request
                .tracks
                .iter()
                .map(|t| TrackStatus {
                    title: t.title.clone(),
                    duration_ms: t.duration_ms,
                    state: "waiting",
                    progress: 0.0,
                })
                .collect(),
            overall: 0.0,
            elapsed_ms: 0,
            remaining_ms: None,
            speed_x: None,
            buffer: None,
            log: Vec::new(),
            message: None,
            output: None,
            test_write: request.test_write,
        }),
        cancel: AtomicBool::new(false),
        started: Instant::now(),
    });
    let id = {
        let mut jobs = JOBS.lock().unwrap_or_else(|e| e.into_inner());
        let (next, map) = jobs.get_or_insert_with(|| (1, HashMap::new()));
        let id = *next;
        *next += 1;
        map.insert(id, job.clone());
        id
    };
    std::thread::Builder::new()
        .name("burn".into())
        .spawn(move || {
            let dir = work_dir().join(format!("job {id}"));
            let result = run(&job, &request, burner.as_ref(), &device, &dir);
            let _ = std::fs::remove_dir_all(&dir);
            let cancelled = job.cancel.load(Ordering::Relaxed);
            match result {
                Ok(output) => {
                    job.log(if request.test_write {
                        "Test write completed successfully"
                    } else {
                        "Burn completed successfully"
                    });
                    job.update(|s| {
                        s.state = "done";
                        s.phase = "Done".into();
                        s.overall = 1.0;
                        s.remaining_ms = Some(0);
                        s.output = Some(output);
                        for t in &mut s.tracks {
                            t.state = "done";
                            t.progress = 1.0;
                        }
                    });
                }
                Err(_) if cancelled => {
                    job.log("Cancelled");
                    job.update(|s| {
                        s.state = "cancelled";
                        s.phase = "Cancelled".into();
                        s.remaining_ms = None;
                    });
                }
                Err(message) => {
                    job.log(format!("Failed: {message}"));
                    job.update(|s| {
                        s.state = "failed";
                        s.phase = "Failed".into();
                        s.remaining_ms = None;
                        if let Some(t) = s
                            .tracks
                            .iter_mut()
                            .find(|t| t.state == "writing" || t.state == "preparing")
                        {
                            t.state = "failed";
                        }
                        s.message = Some(message);
                    });
                }
            }
        })
        .map_err(|e| format!("starting the burn: {e}"))?;
    Ok(id)
}

fn job(id: u64) -> Result<Arc<Job>, String> {
    JOBS.lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|(_, m)| m.get(&id).cloned())
        .ok_or_else(|| "That burn has finished.".to_string())
}

pub fn status(id: u64) -> Result<Status, String> {
    let job = job(id)?;
    let mut s = job.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if s.state == "preparing" || s.state == "writing" {
        s.elapsed_ms = job.started.elapsed().as_millis() as u64;
    }
    Ok(s)
}

pub fn cancel(id: u64) -> Result<(), String> {
    job(id)?.cancel.store(true, Ordering::Relaxed);
    Ok(())
}

/// Forgets a finished job.
pub fn close(id: u64) {
    if let Some((_, m)) = JOBS.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        m.remove(&id);
    }
}

// Decoding takes about this share of the whole job's progress bar for a
// drive; writing an image is mostly decoding.
fn prepare_share(kind: &str) -> f64 {
    if kind == "image" { 0.7 } else { 0.15 }
}

fn run(
    job: &Job,
    request: &BurnRequest,
    burner: &dyn Burner,
    device: &Device,
    dir: &Path,
) -> Result<String, String> {
    let n = request.tracks.len();
    job.log(format!(
        "Sound Scraper {} on {} {}",
        crate::VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    job.log(format!(
        "Options: gaps {} s, CD-Text {}, speed {}, test write {}, eject {}",
        request.gap_seconds,
        if request.cd_text { "on" } else { "off" },
        if request.speed == 0 { "maximum".to_string() } else { format!("{}x", request.speed) },
        if request.test_write { "on" } else { "off" },
        if request.eject { "on" } else { "off" },
    ));
    job.log(format!(
        "Preparing {} for {}",
        if n == 1 {
            "1 track".to_string()
        } else {
            format!("{n} tracks")
        },
        device.name
    ));
    // Nothing is written before every track decodes, so a bad file fails early.
    std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    let share = prepare_share(&device.kind);
    let total_ms: u64 = request.tracks.iter().map(|t| t.duration_ms.max(1)).sum();
    let mut done_ms = 0u64;
    let mut infos = Vec::with_capacity(n);
    let mut files = Vec::with_capacity(n);
    for (i, track) in request.tracks.iter().enumerate() {
        job.update(|s| s.tracks[i].state = "preparing");
        let out = dir.join(format!("{:02}.pcm", i + 1));
        let expected = track.duration_ms.max(1);
        let frames = to_cd_audio(Path::new(&track.path), &out, &job.cancel, |ms| {
            let p = (ms as f64 / expected as f64).min(1.0);
            job.update(|s| {
                s.tracks[i].progress = p;
                s.overall = share * (done_ms as f64 + p * expected as f64) / total_ms as f64;
            });
        })
        .map_err(|e| format!("{}: {e}", track.title))?;
        done_ms += expected;
        job.update(|s| {
            s.tracks[i].state = "ready";
            s.tracks[i].progress = 0.0;
        });
        infos.push(TrackInfo {
            title: track.title.clone(),
            performer: track.performer.clone(),
            frames,
        });
        files.push(out);
    }
    let layout = disc::layout(&infos, request.gap_seconds)?;
    for (t, info) in layout.tracks.iter().zip(&infos) {
        if info.frames < disc::MIN_TRACK_SECTORS * disc::FRAMES_PER_SECTOR {
            job.log(format!(
                "Track {}: shorter than 4 seconds, padded with silence",
                t.number
            ));
        }
        // Pad each file to whole sectors.
        let path = &files[t.number as usize - 1];
        let want = t.sectors * disc::SECTOR_BYTES as u64;
        let f = std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        f.set_len(want)
            .map_err(|e| format!("padding a track: {e}"))?;
    }
    if let Some(capacity) = device.media.capacity {
        layout.check_fits(capacity)?;
    }
    let prepared = PreparedDisc {
        title: request.title.clone(),
        performer: request.performer.clone(),
        tracks: infos,
        files,
        layout,
    };
    job.log(format!(
        "{} on disc with gaps ({} sectors)",
        disc::msf_time(prepared.layout.disc_sectors),
        prepared.layout.disc_sectors
    ));
    job.update(|s| {
        s.state = "writing";
        s.phase = "Starting".into();
        s.overall = share;
    });

    let options = WriteOptions {
        image_path: request.image_path.as_ref().map(PathBuf::from),
        speed: request.speed,
        test_write: request.test_write,
        cd_text: request.cd_text,
        eject: request.eject,
        erase: request.erase,
    };
    let layout = &prepared.layout;
    let program = layout.program_sectors.max(1);
    let write_started = Mutex::new(None::<(Instant, u64)>);
    let last_track = Mutex::new(None::<usize>);
    let events = |e: BurnEvent| match e {
        BurnEvent::Phase(p) => {
            job.log(p.clone());
            job.update(|s| s.phase = p);
        }
        BurnEvent::Log(text) => job.log(text),
        BurnEvent::Written {
            sectors,
            speed_x,
            buffer,
        } => {
            let (track, fraction) = layout.locate(sectors.saturating_sub(1).min(program - 1));
            let mut last = last_track.lock().unwrap();
            if *last != Some(track) {
                *last = Some(track);
                job.log(format!(
                    "Track {}: {}",
                    track + 1,
                    prepared.tracks[track].title
                ));
            }
            let mut started = write_started.lock().unwrap();
            let (t0, s0) = *started.get_or_insert((Instant::now(), sectors));
            let rate = (sectors - s0) as f64 / t0.elapsed().as_secs_f64().max(0.001);
            let remaining = (rate > 0.0 && sectors > s0)
                .then(|| ((program - sectors) as f64 / rate * 1000.0) as u64);
            job.update(|s| {
                s.phase = format!("Writing track {} of {}", track + 1, layout.tracks.len());
                for (i, t) in s.tracks.iter_mut().enumerate() {
                    if i < track {
                        t.state = "done";
                        t.progress = 1.0;
                    } else if i == track {
                        t.state = "writing";
                        t.progress = fraction;
                    }
                }
                s.overall = share + (1.0 - share) * sectors as f64 / program as f64;
                s.speed_x = speed_x;
                s.buffer = buffer;
                s.remaining_ms = remaining;
            });
        }
    };
    let _awake = (device.kind == "drive").then(StayAwake::new);
    burner.write(&prepared, &options, &events, &job.cancel)
}

/// Keeps the Mac from sleeping during a burn (Windows does this in its
/// burner): `caffeinate -i` until dropped.
struct StayAwake(Option<std::process::Child>);

impl StayAwake {
    fn new() -> Self {
        #[cfg(target_os = "macos")]
        return Self(std::process::Command::new("/usr/bin/caffeinate").arg("-i").spawn().ok());
        #[allow(unreachable_code)]
        Self(None)
    }
}

impl Drop for StayAwake {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Writes a job's log as text (to send to someone helping).
pub fn save_log(id: u64, path: &Path) -> Result<(), String> {
    let s = status(id)?;
    let mut text = format!("Sound Scraper burn log: {} ({})\n", s.destination, s.state);
    for l in &s.log {
        let t = l.at_ms / 1000;
        text.push_str(&format!("[{:02}:{:02}.{:01}] {}\n", t / 60, t % 60, (l.at_ms % 1000) / 100, l.text));
    }
    if let Some(m) = &s.message {
        text.push_str(&format!("Error: {m}\n"));
    }
    for (i, t) in s.tracks.iter().enumerate() {
        text.push_str(&format!("Track {}: {} ({} ms) {}\n", i + 1, t.title, t.duration_ms, t.state));
    }
    std::fs::write(path, text).map_err(|e| format!("writing {}: {e}", path.display()))
}

/// Decodes `src` to 44.1 kHz 16-bit stereo little-endian PCM at `out`
/// (resampled if needed, with TPDF dither); returns the frames written.
/// `progress` gets the milliseconds decoded so far.
pub fn to_cd_audio(
    src: &Path,
    out: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64),
) -> Result<u64, String> {
    let mut source = Source::open(src)?;
    let mut resampler = (source.rate != SAMPLE_RATE).then(|| Stereo::new(source.rate, SAMPLE_RATE));
    let file = File::create(out).map_err(|e| format!("creating {}: {e}", out.display()))?;
    let mut w = BufWriter::with_capacity(1 << 20, file);
    let mut dither = Dither::new();
    let mut decoded = Vec::new();
    let mut converted = Vec::new();
    let mut frames = 0u64;
    let mut in_frames = 0u64;
    let mut last_report = 0u64;
    let mut bytes = Vec::new();
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled.".into());
        }
        let more = source.decode(&mut decoded);
        in_frames += decoded.len() as u64 / 2;
        let block: &[f32] = match resampler.as_mut() {
            Some(r) => {
                r.process(&mut decoded, &mut converted, !more);
                &converted
            }
            None => &decoded,
        };
        bytes.clear();
        for s in block {
            bytes.extend_from_slice(&dither.quantize(*s).to_le_bytes());
        }
        w.write_all(&bytes)
            .map_err(|e| format!("writing {}: {e}", out.display()))?;
        frames += block.len() as u64 / 2;
        decoded.clear();
        converted.clear();
        let ms = in_frames * 1000 / u64::from(source.rate);
        if ms - last_report >= 500 {
            last_report = ms;
            progress(ms);
        }
        if !more {
            break;
        }
    }
    w.flush()
        .map_err(|e| format!("writing {}: {e}", out.display()))?;
    progress(in_frames * 1000 / u64::from(source.rate));
    if frames == 0 {
        return Err("no audio could be decoded".into());
    }
    Ok(frames)
}

/// Triangular (TPDF) dither to 16 bits, from a small xorshift generator.
struct Dither(u32);

impl Dither {
    fn new() -> Self {
        Self(0x9E37_79B9)
    }

    fn next(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x as f32 / u32::MAX as f32
    }

    fn quantize(&mut self, sample: f32) -> i16 {
        let tpdf = self.next() - self.next(); // -1..1 LSB, triangular
        (sample * 32767.0 + tpdf).round().clamp(-32768.0, 32767.0) as i16
    }
}

/// One request from the UI (`ss_burn`), as JSON with an `op`.
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Request {
    Devices,
    Start(BurnRequest),
    Status { id: u64 },
    Cancel { id: u64 },
    Close { id: u64 },
    SimSettings,
    SetSimSettings { settings: SimSettings },
    /// Shows a burned image in Finder / Explorer.
    Reveal { path: String },
    /// Writes a job's log to a text file.
    SaveLog { id: u64, path: String },
}

pub fn handle(request: Request) -> Result<serde_json::Value, String> {
    use serde_json::{Value, json, to_value};
    let v = |r: Result<Value, serde_json::Error>| r.map_err(|e| e.to_string());
    match request {
        Request::Devices => Ok(json!({ "devices": devices(), "simulator": simulator_enabled() })),
        Request::Start(r) => Ok(json!(start(r)?)),
        Request::Status { id } => v(to_value(status(id)?)),
        Request::Cancel { id } => cancel(id).map(|()| Value::Null),
        Request::Close { id } => {
            close(id);
            Ok(Value::Null)
        }
        Request::SimSettings => v(to_value(disc::sim::settings())),
        Request::SetSimSettings { settings } => {
            disc::sim::set_settings(settings);
            Ok(Value::Null)
        }
        Request::SaveLog { id, path } => save_log(id, Path::new(&path)).map(|()| Value::Null),
        Request::Reveal { path } => crate::library::reveal_in_file_manager(Path::new(&path)).map(|()| Value::Null),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        mp3::tests::{encode_all, sine},
        paths::tempdir,
    };

    fn mp3(dir: &Path, name: &str, seconds: f64, rate: u32) -> String {
        let path = dir.join(name);
        std::fs::write(&path, encode_all(&sine(seconds, rate), rate, true)).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn decodes_and_resamples_to_cd_audio() {
        let dir = tempdir();
        for rate in [44_100, 48_000] {
            let src = mp3(&dir, &format!("{rate}.mp3"), 2.0, rate);
            let out = dir.join(format!("{rate}.pcm"));
            let frames =
                to_cd_audio(Path::new(&src), &out, &AtomicBool::new(false), |_| {}).unwrap();
            assert!(
                (frames as i64 - 88_200).abs() < 1200,
                "{rate}: {frames} frames"
            );
            let bytes = std::fs::read(&out).unwrap();
            assert_eq!(bytes.len() as u64, frames * 4);
            // The sine is there: a loud-ish peak somewhere in the middle.
            let peak = bytes[20_000..40_000]
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]).unsigned_abs())
                .max()
                .unwrap();
            assert!(peak > 3000, "{rate}: peak {peak}");
        }
    }

    #[test]
    fn burns_an_image_with_per_track_status() {
        let dir = tempdir();
        let a = mp3(&dir, "a.mp3", 1.0, 44_100);
        let b = mp3(&dir, "b.mp3", 5.0, 48_000);
        let cue = dir.join("out").join("Mix.cue");
        std::fs::create_dir_all(cue.parent().unwrap()).unwrap();
        let id = start(BurnRequest {
            device_id: "image".into(),
            title: "Mix".into(),
            performer: None,
            tracks: vec![
                BurnTrack {
                    path: a,
                    title: "A".into(),
                    performer: Some("X".into()),
                    duration_ms: 1000,
                },
                BurnTrack {
                    path: b,
                    title: "B".into(),
                    performer: None,
                    duration_ms: 5000,
                },
            ],
            gap_seconds: 2,
            cd_text: true,
            test_write: false,
            speed: 0,
            eject: true,
            erase: false,
            image_path: Some(cue.to_string_lossy().into_owned()),
        })
        .unwrap();
        let s = loop {
            let s = status(id).unwrap();
            if s.state != "preparing" && s.state != "writing" {
                break s;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        assert_eq!(s.state, "done", "{:?}", s.message);
        assert!(s.tracks.iter().all(|t| t.state == "done"));
        let sheet = std::fs::read_to_string(&cue).unwrap();
        assert!(
            sheet.contains("TITLE \"A\"") && sheet.contains("PERFORMER \"X\""),
            "{sheet}"
        );
        // Track 1 is padded to 4 s; then a 2 s gap; then about 5 s.
        assert!(
            sheet.contains("INDEX 00 00:04:00") && sheet.contains("INDEX 01 00:06:00"),
            "{sheet}"
        );
        let bin = std::fs::metadata(dir.join("out").join("Mix.bin"))
            .unwrap()
            .len();
        assert_eq!(bin % disc::SECTOR_BYTES as u64, 0);
        assert!(
            s.log.iter().any(|l| l.text.contains("padded")),
            "{:?}",
            s.log
        );
        close(id);
        assert!(status(id).is_err());
    }

    #[test]
    fn bad_files_fail_before_writing() {
        let dir = tempdir();
        let bad = dir.join("bad.mp3");
        std::fs::write(&bad, b"not audio").unwrap();
        let cue = dir.join("X.cue");
        let id = start(BurnRequest {
            device_id: "image".into(),
            title: "X".into(),
            performer: None,
            tracks: vec![BurnTrack {
                path: bad.to_string_lossy().into(),
                title: "Bad".into(),
                performer: None,
                duration_ms: 1,
            }],
            gap_seconds: 2,
            cd_text: true,
            test_write: false,
            speed: 0,
            eject: true,
            erase: false,
            image_path: Some(cue.to_string_lossy().into()),
        })
        .unwrap();
        let s = loop {
            let s = status(id).unwrap();
            if s.state != "preparing" && s.state != "writing" {
                break s;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        assert_eq!(s.state, "failed");
        assert_eq!(s.tracks[0].state, "failed");
        assert!(s.message.unwrap().starts_with("Bad:"));
        assert!(!cue.exists());
    }

    #[test]
    fn devices_list_the_image_last() {
        let d = devices();
        assert_eq!(d.last().unwrap().id, "image");
        assert!(burner_for("nope").is_err());
    }
}

//! Milestone 1 spike: record a few seconds of system or app audio to a WAV
//! file, to prove capture works before the MP3 recorder exists.

use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, Instant},
};

use sound_scraper_capture::{CaptureSource, default_backend};

use crate::{paths, sources};

#[derive(Debug, Clone)]
pub struct CaptureReport {
    pub path: PathBuf,
    pub frames: u64,
    pub sample_rate: u32,
    pub channels: u16,
    /// Largest absolute sample value; 0.0 means the capture was silent.
    pub peak: f32,
}

/// Records `seconds` of audio from `app_pid` (or all system audio when
/// `None`) into a new WAV file under the recordings folder.
pub fn record_test_wav(app_pid: Option<u32>, seconds: f64) -> Result<CaptureReport, String> {
    if !(seconds > 0.0 && seconds <= 600.0) {
        return Err(format!("seconds must be in (0, 600], got {seconds}"));
    }
    let source = sources::source_for_pid(app_pid);
    let path = paths::recordings_dir().join(format!(
        "{} capture test {}.wav",
        paths::sanitize(&sources::source_label(&source)),
        chrono::Local::now().format("%Y-%m-%d %H-%M-%S")
    ));
    record(source, seconds, &path)
}

fn record(source: CaptureSource, seconds: f64, path: &Path) -> Result<CaptureReport, String> {
    let mut backend = default_backend();
    let (tx, rx) = mpsc::sync_channel(256);
    // Early returns drop the backend, which tears the capture down.
    let session = backend.start(source, tx).map_err(|e| e.to_string())?;

    let mut writer: Option<hound::WavWriter<_>> = None;
    let mut report = CaptureReport { path: path.to_owned(), frames: 0, sample_rate: 0, channels: 0, peak: 0.0 };
    let deadline = Instant::now() + Duration::from_secs_f64(seconds + 3.0);
    let result = loop {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            break Err("timed out waiting for audio from the capture device".to_string());
        };
        let chunk = match rx.recv_timeout(remaining) {
            Ok(chunk) => chunk,
            Err(_) => break Err("no audio arrived from the capture device".to_string()),
        };
        if writer.is_none() {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
            }
            let spec = hound::WavSpec {
                channels: chunk.channels,
                sample_rate: chunk.sample_rate,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            };
            report.sample_rate = chunk.sample_rate;
            report.channels = chunk.channels;
            writer = Some(hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?);
        }
        let w = writer.as_mut().unwrap();
        let wanted = (seconds * report.sample_rate as f64) as u64;
        let take = ((wanted - report.frames) as usize * report.channels as usize).min(chunk.samples.len());
        for &s in &chunk.samples[..take] {
            report.peak = report.peak.max(s.abs());
            w.write_sample(s).map_err(|e| format!("writing {}: {e}", path.display()))?;
        }
        report.frames += (take / report.channels.max(1) as usize) as u64;
        if report.frames >= wanted {
            break Ok(());
        }
    };
    backend.stop(session);

    if let Some(w) = writer {
        w.finalize().map_err(|e| e.to_string())?;
    }
    result.map(|()| report)
}

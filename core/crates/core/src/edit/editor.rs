//! An open editor: the recording's waveform summary, built on a worker
//! thread, and drawing of the visible stretch into an RGBA buffer for the
//! native waveform view (like the visualizer). Splices, regions and the
//! playhead are drawn on top by React Native, not here.

use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU32, Ordering},
    },
    thread::JoinHandle,
};

use serde::Deserialize;

use super::peaks::{BUCKET, Peaks};
use crate::player::Source;

pub struct Editor {
    path: PathBuf,
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
    /// Decoded samples for deep zoom: (first frame, interleaved stereo).
    detail: Mutex<Option<(u64, Vec<f32>)>>,
    style: Mutex<(String, Style)>,
}

#[derive(Default)]
struct Shared {
    peaks: Mutex<Option<Arc<Peaks>>>,
    error: Mutex<Option<String>>,
    /// 0..=1 as f32 bits.
    progress: AtomicU32,
    cancel: AtomicBool,
}

/// Where the editor is with the waveform.
#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    Loading(f32),
    Ready { rate: u32, frames: u64 },
    Failed(String),
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Style {
    background: [u8; 4],
    wave: [u8; 4],
    rms: [u8; 4],
    center: [u8; 4],
}

impl Default for Style {
    fn default() -> Self {
        Self {
            background: [0x14, 0x12, 0x10, 0xff],
            wave: [0x7f, 0xd8, 0x5a, 0xff],
            rms: [0xb8, 0xf0, 0x9a, 0xff],
            center: [0x3a, 0x34, 0x30, 0xff],
        }
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct StyleJson {
    background: Option<String>,
    wave: Option<String>,
    rms: Option<String>,
    center: Option<String>,
}

fn parse_color(s: &str) -> Option<[u8; 4]> {
    let h = s.strip_prefix('#')?;
    let digit = |i: usize, n: usize| u8::from_str_radix(&h[i..i + n], 16).ok();
    match h.len() {
        3 | 4 => {
            let mut c = [255u8; 4];
            for (i, v) in c.iter_mut().enumerate().take(h.len()) {
                *v = digit(i, 1)? * 17;
            }
            Some(c)
        }
        6 | 8 => {
            let mut c = [255u8; 4];
            for (i, v) in c.iter_mut().enumerate().take(h.len() / 2) {
                *v = digit(i * 2, 2)?;
            }
            Some(c)
        }
        _ => None,
    }
}

impl Editor {
    /// Opens `path` and starts building its waveform summary.
    pub fn open(path: &Path) -> Self {
        let shared = Arc::new(Shared::default());
        let worker = {
            let shared = shared.clone();
            let path = path.to_path_buf();
            std::thread::Builder::new()
                .name("editor-peaks".into())
                .spawn(move || {
                    let report = |p: f32| shared.progress.store(p.to_bits(), Ordering::Relaxed);
                    match Peaks::load_or_build(&path, &report, &shared.cancel) {
                        Ok(peaks) => *shared.peaks.lock().unwrap() = Some(Arc::new(peaks)),
                        Err(e) => *shared.error.lock().unwrap() = Some(e),
                    }
                })
                .ok()
        };
        Self {
            path: path.to_path_buf(),
            shared,
            worker,
            detail: Mutex::new(None),
            style: Mutex::new((String::new(), Style::default())),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn status(&self) -> Status {
        if let Some(p) = self.shared.peaks.lock().unwrap().as_ref() {
            return Status::Ready { rate: p.rate, frames: p.frames };
        }
        if let Some(e) = self.shared.error.lock().unwrap().as_ref() {
            return Status::Failed(e.clone());
        }
        Status::Loading(f32::from_bits(self.shared.progress.load(Ordering::Relaxed)))
    }

    /// Sets the colors (JSON: background, wave, rms, center as #rrggbb[aa]).
    fn apply_style(&self, json: &str) -> Style {
        let mut cached = self.style.lock().unwrap();
        if cached.0 != json {
            let parsed: StyleJson = serde_json::from_str(json).unwrap_or_default();
            let d = Style::default();
            let pick = |v: &Option<String>, fallback| v.as_deref().and_then(parse_color).unwrap_or(fallback);
            cached.1 = Style {
                background: pick(&parsed.background, d.background),
                wave: pick(&parsed.wave, d.wave),
                rms: pick(&parsed.rms, d.rms),
                center: pick(&parsed.center, d.center),
            };
            cached.0 = json.to_string();
        }
        cached.1
    }

    /// Draws `width`×`height` pixels starting at `start_ms`, `ms_per_px`
    /// milliseconds per pixel, into premultiplied RGBA. False until the
    /// waveform is ready (the background is drawn anyway).
    pub fn render(&self, start_ms: f64, ms_per_px: f64, width: u32, height: u32, style_json: &str, rgba: &mut [u8]) -> bool {
        let style = self.apply_style(style_json);
        let (w, h) = (width as usize, height as usize);
        for px in rgba.chunks_exact_mut(4) {
            px.copy_from_slice(&premultiply(style.background));
        }
        let mid = h / 2;
        let center = premultiply(style.center);
        for x in 0..w {
            put(rgba, w, x, mid, center);
        }
        let Some(peaks) = self.shared.peaks.lock().unwrap().clone() else { return false };
        let fpp = ms_per_px / 1000.0 * f64::from(peaks.rate);
        let start = start_ms / 1000.0 * f64::from(peaks.rate);
        if fpp <= 0.0 {
            return true;
        }
        let detailed = fpp < BUCKET as f64 / 2.0;
        if detailed {
            self.load_detail(start.max(0.0) as u64, (start + fpp * w as f64).ceil().max(0.0) as u64, peaks.frames);
        }
        let detail = self.detail.lock().unwrap();
        let half = (h as f64 - 1.0) / 2.0;
        let y = |v: f32| (half - f64::from(v.clamp(-1.0, 1.0)) * half).round().clamp(0.0, h as f64 - 1.0) as usize;
        let (wave, rms) = (premultiply(style.wave), premultiply(style.rms));
        for x in 0..w {
            let a = start + x as f64 * fpp;
            let b = (a + fpp).min(peaks.frames as f64);
            if b <= 0.0 || a >= peaks.frames as f64 {
                continue;
            }
            let range = match (detailed, detail.as_ref()) {
                (true, Some((first, samples))) => sample_range(*first, samples, a.max(0.0), b),
                _ => peaks.range(a, b),
            };
            let Some((lo, hi, r)) = range else { continue };
            let (top, bottom) = (y(hi), y(lo));
            for yy in top..=bottom.max(top) {
                put(rgba, w, x, yy, wave);
            }
            if !detailed || fpp >= 4.0 {
                let (rt, rb) = (y(r.min(hi)), y((-r).max(lo)));
                for yy in rt..=rb.max(rt) {
                    put(rgba, w, x, yy, rms);
                }
            }
        }
        true
    }

    /// Makes sure the detail cache holds frames `a..b`.
    fn load_detail(&self, a: u64, b: u64, total: u64) {
        let b = b.min(total);
        let mut detail = self.detail.lock().unwrap();
        if let Some((first, samples)) = detail.as_ref()
            && *first <= a
            && first + (samples.len() / 2) as u64 >= b
        {
            return;
        }
        // Decode a bit more than asked, so small scrolls reuse it.
        let span = (b - a.min(b)).max(1);
        let from = a.saturating_sub(span / 2);
        let to = (b + span / 2).min(total);
        let Ok(mut source) = Source::open(&self.path) else { return };
        if !source.seek_frame(from) {
            return;
        }
        let want = (to - from) as usize * 2;
        let mut samples = Vec::with_capacity(want);
        while samples.len() < want && source.decode(&mut samples) {}
        samples.truncate(want);
        *detail = Some((from, samples));
    }
}

impl Drop for Editor {
    fn drop(&mut self) {
        self.shared.cancel.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn sample_range(first: u64, samples: &[f32], a: f64, b: f64) -> Option<(f32, f32, f32)> {
    let i = (a as u64).checked_sub(first)? as usize;
    // Through the next sample too, so neighbouring columns join up.
    let j = ((b.ceil() as u64 + 1).saturating_sub(first) as usize).max(i + 1).min(samples.len() / 2);
    if i >= j {
        return None;
    }
    let (mut lo, mut hi, mut sq) = (f32::MAX, f32::MIN, 0f64);
    for f in samples[i * 2..j * 2].chunks_exact(2) {
        lo = lo.min(f[0]).min(f[1]);
        hi = hi.max(f[0]).max(f[1]);
        sq += (f64::from(f[0]).powi(2) + f64::from(f[1]).powi(2)) / 2.0;
    }
    Some((lo, hi, (sq / (j - i) as f64).sqrt() as f32))
}

fn premultiply(c: [u8; 4]) -> [u8; 4] {
    let a = u16::from(c[3]);
    let m = |v: u8| ((u16::from(v) * a + 127) / 255) as u8;
    [m(c[0]), m(c[1]), m(c[2]), c[3]]
}

fn put(rgba: &mut [u8], w: usize, x: usize, y: usize, c: [u8; 4]) {
    let i = (y * w + x) * 4;
    if let Some(px) = rgba.get_mut(i..i + 4) {
        px.copy_from_slice(&c);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_colors() {
        assert_eq!(parse_color("#abc"), Some([0xaa, 0xbb, 0xcc, 0xff]));
        assert_eq!(parse_color("#11223344"), Some([0x11, 0x22, 0x33, 0x44]));
        assert_eq!(parse_color("red"), None);
    }

    #[test]
    fn draws_a_waveform_once_ready() {
        let dir = crate::paths::tempdir();
        let rate = 48000;
        let samples: Vec<f32> = (0..rate * 2)
            .flat_map(|i| {
                let v = if i < rate { 0.0 } else { (i as f32 * 0.05).sin() * 0.8 };
                [v, v]
            })
            .collect();
        let path = dir.join("w.mp3");
        std::fs::write(&path, crate::mp3::tests::encode_all(&samples, rate, true)).unwrap();
        let editor = Editor::open(&path);
        let start = std::time::Instant::now();
        while !matches!(editor.status(), Status::Ready { .. }) {
            assert!(start.elapsed().as_secs() < 10, "{:?}", editor.status());
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let style = r##"{"background":"#000000","wave":"#ff0000","rms":"#00ff00","center":"#0000ff"}"##;
        let (w, h) = (100u32, 40u32);
        let mut buf = vec![0u8; (w * h * 4) as usize];
        // The whole 2 s: left half silent, right half loud.
        assert!(editor.render(0.0, 20.0, w, h, style, &mut buf));
        // Pixels drawn as wave or RMS in column x.
        let colored = |buf: &[u8], x: usize| {
            (0..h as usize)
                .filter(|&y| {
                    let p = &buf[(y * w as usize + x) * 4..][..4];
                    p[0] == 255 || p[1] == 255
                })
                .count()
        };
        assert!(colored(&buf, 10) <= 2, "silence is a thin line");
        assert!(colored(&buf, 80) > 20, "sound is tall");
        // Deep zoom decodes samples directly.
        assert!(editor.render(1500.0, 0.1, w, h, style, &mut buf));
        assert!((0..w as usize).any(|x| colored(&buf, x) > 3));
    }
}

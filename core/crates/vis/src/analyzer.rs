//! The analyzer thread: drains the tap and publishes a frame ~60×/s.

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use realfft::{RealFftPlanner, RealToComplex, num_complex::Complex};

use crate::{BANDS, Frame, VisHub, WAVEFORM};

/// FFT window in samples.
pub const WINDOW: usize = 2048;
/// Ring capacity in stereo frames (about 0.7 s at 48 kHz).
const RING_FRAMES: usize = 32 * 1024;
const TICK: Duration = Duration::from_micros(16_667);
/// Spectrum range shown, in Hz.
const LOW_HZ: f32 = 30.0;
const HIGH_HZ: f32 = 16_000.0;
/// dB mapped to 0 and 1.
const FLOOR_DB: f32 = -70.0;
const PEAK_HOLD: Duration = Duration::from_millis(400);
/// Peak fall speed, in full scale per second.
const PEAK_FALL: f32 = 1.2;
/// Band fall speed, in full scale per second (rises are immediate).
const BAND_FALL: f32 = 2.5;
/// Time constant of the level meters' fall when no audio arrives, in s.
const LEVEL_FALL: f32 = 0.12;

/// The producer end, owned by the encoder thread. Pushing never blocks:
/// when the analyzer falls behind, audio is dropped (it's only for display).
pub struct Tap {
    producer: rtrb::Producer<f32>,
}

impl Tap {
    /// Pushes interleaved stereo samples.
    pub fn push_stereo(&mut self, samples: &[f32]) {
        let n = self.producer.slots().min(samples.len()) & !1;
        if n == 0 {
            return;
        }
        if let Ok(mut chunk) = self.producer.write_chunk_uninit(n) {
            let (a, b) = chunk.as_mut_slices();
            for (slot, s) in a.iter_mut().chain(b.iter_mut()).zip(samples) {
                slot.write(*s);
            }
            // SAFETY: all n slots were just written.
            unsafe { chunk.commit_all() };
        }
    }
}

/// A running analyzer; stops (and clears the hub) when dropped.
pub struct Analyzer {
    running: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    hub: Arc<VisHub>,
}

impl Analyzer {
    /// Starts analyzing audio at `sample_rate`, publishing to `hub`.
    /// Returns the analyzer and the tap to feed it.
    pub fn start(hub: Arc<VisHub>, sample_rate: u32) -> (Self, Tap) {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_FRAMES * 2);
        let (input, output) = triple_buffer::triple_buffer(&Frame::default());
        hub.connect(output);
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        let thread = std::thread::Builder::new()
            .name("sound-scraper-analyzer".into())
            .spawn(move || {
                let mut state = State::new(sample_rate.max(8000));
                let mut input = input;
                let mut consumer = consumer;
                let mut next = Instant::now();
                while flag.load(Ordering::Acquire) {
                    state.drain(&mut consumer);
                    state.analyze(Instant::now());
                    input.write(state.frame.clone());
                    next += TICK;
                    let now = Instant::now();
                    if next > now {
                        std::thread::sleep(next - now);
                    } else {
                        next = now;
                    }
                }
            })
            .ok();
        (
            Self {
                running,
                thread,
                hub,
            },
            Tap { producer },
        )
    }
}

impl Drop for Analyzer {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        self.hub.disconnect();
    }
}

/// Analysis state; separate from the thread so tests can drive it.
pub(crate) struct State {
    /// Mono history, newest last, WINDOW long.
    history: Vec<f32>,
    peak: [f32; 2],
    sum_sq: [f64; 2],
    count: u64,
    fft: Arc<dyn RealToComplex<f32>>,
    window: Vec<f32>,
    scratch_in: Vec<f32>,
    spectrum: Vec<Complex<f32>>,
    /// FFT bin range [start, end) per band.
    band_bins: Vec<(usize, usize)>,
    peak_times: Vec<Instant>,
    flux_avg: f32,
    last: Option<Instant>,
    pub(crate) frame: Frame,
}

impl State {
    pub(crate) fn new(sample_rate: u32) -> Self {
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(WINDOW);
        let spectrum = fft.make_output_vec();
        let window = (0..WINDOW)
            .map(|i| {
                0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (WINDOW - 1) as f32).cos()
            })
            .collect();
        Self {
            history: vec![0.0; WINDOW],
            peak: [0.0; 2],
            sum_sq: [0.0; 2],
            count: 0,
            fft,
            window,
            scratch_in: vec![0.0; WINDOW],
            spectrum,
            band_bins: band_bins(sample_rate),
            peak_times: vec![Instant::now(); BANDS],
            flux_avg: 0.0,
            last: None,
            frame: Frame::default(),
        }
    }

    fn drain(&mut self, consumer: &mut rtrb::Consumer<f32>) {
        let n = consumer.slots() & !1;
        if n == 0 {
            return;
        }
        if let Ok(chunk) = consumer.read_chunk(n) {
            let (a, b) = chunk.as_slices();
            let samples: Vec<f32> = a.iter().chain(b).copied().collect();
            chunk.commit_all();
            self.push(&samples);
        }
    }

    /// Adds interleaved stereo samples.
    pub(crate) fn push(&mut self, samples: &[f32]) {
        let frames = samples.len() / 2;
        let keep = frames.min(WINDOW);
        self.history.drain(..keep);
        for pair in samples.chunks_exact(2).skip(frames - keep) {
            self.history.push((pair[0] + pair[1]) * 0.5);
        }
        for pair in samples.chunks_exact(2) {
            for (ch, &s) in pair.iter().enumerate() {
                self.peak[ch] = self.peak[ch].max(s.abs());
                self.sum_sq[ch] += f64::from(s * s);
            }
        }
        self.count += frames as u64;
    }

    pub(crate) fn analyze(&mut self, now: Instant) {
        let dt = self.last.map_or(TICK, |l| now - l).as_secs_f32().min(0.25);
        self.last = Some(now);

        // Levels since the last frame. Captures deliver in bursts, so a tick
        // without new audio lets the meters fall back instead of blinking
        // to zero.
        let f = &mut self.frame;
        for ch in 0..2 {
            if self.count == 0 {
                let fall = (-dt / LEVEL_FALL).exp();
                f.peak[ch] *= fall;
                f.rms[ch] *= fall;
            } else {
                f.peak[ch] = self.peak[ch];
                f.rms[ch] = (self.sum_sq[ch] / self.count as f64).sqrt() as f32;
            }
        }
        self.peak = [0.0; 2];
        self.sum_sq = [0.0; 2];
        self.count = 0;

        // Waveform.
        f.waveform
            .copy_from_slice(&self.history[WINDOW - WAVEFORM..]);

        // Spectrum.
        for (i, s) in self.scratch_in.iter_mut().enumerate() {
            *s = self.history[i] * self.window[i];
        }
        if self
            .fft
            .process(&mut self.scratch_in, &mut self.spectrum)
            .is_err()
        {
            return;
        }
        // A full-scale sine gives |X| = N/4 with a Hann window.
        let scale = 4.0 / WINDOW as f32;
        let mut flux = 0.0;
        for (b, &(start, end)) in self.band_bins.iter().enumerate() {
            let mag = self.spectrum[start..end]
                .iter()
                .map(|c| c.norm())
                .fold(0.0f32, f32::max)
                * scale;
            let db = 20.0 * mag.max(1e-9).log10();
            let level = ((db - FLOOR_DB) / -FLOOR_DB).clamp(0.0, 1.0);
            let previous = f.bands[b];
            flux += (level - previous).max(0.0);
            f.bands[b] = if level >= previous {
                level
            } else {
                (previous - BAND_FALL * dt).max(level)
            };
            if f.bands[b] >= f.band_peaks[b] {
                f.band_peaks[b] = f.bands[b];
                self.peak_times[b] = now;
            } else if now.duration_since(self.peak_times[b]) > PEAK_HOLD {
                f.band_peaks[b] = (f.band_peaks[b] - PEAK_FALL * dt).max(f.bands[b]);
            }
        }

        // Onset: flux well above its recent average.
        let ratio = if self.flux_avg > 1e-4 {
            flux / self.flux_avg
        } else {
            0.0
        };
        f.onset = ((ratio - 1.3) / 1.7)
            .clamp(0.0, 1.0)
            .max(f.onset - 4.0 * dt);
        self.flux_avg = self.flux_avg * 0.9 + flux * 0.1;
    }
}

/// Log-spaced bands from LOW_HZ to HIGH_HZ (or Nyquist), each at least one
/// FFT bin wide.
fn band_bins(sample_rate: u32) -> Vec<(usize, usize)> {
    let bin_hz = sample_rate as f32 / WINDOW as f32;
    let high = HIGH_HZ.min(sample_rate as f32 / 2.0 * 0.95);
    let max_bin = WINDOW / 2;
    let mut bins = Vec::with_capacity(BANDS);
    let mut last_end = 1;
    for b in 0..BANDS {
        let lo = LOW_HZ * (high / LOW_HZ).powf(b as f32 / BANDS as f32);
        let hi = LOW_HZ * (high / LOW_HZ).powf((b + 1) as f32 / BANDS as f32);
        let start = ((lo / bin_hz).floor() as usize)
            .max(last_end.min(max_bin - 1))
            .max(1);
        let end = ((hi / bin_hz).ceil() as usize).max(start + 1).min(max_bin);
        bins.push((start, end));
        last_end = end;
    }
    bins
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, rate: u32, frames: usize, amp: f32, phase0: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = amp
                    * (2.0 * std::f32::consts::PI * freq * (i + phase0) as f32 / rate as f32).sin();
                [s, s * 0.5]
            })
            .collect()
    }

    fn loudest_band(f: &Frame) -> usize {
        f.bands
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .unwrap()
            .0
    }

    #[test]
    fn a_tone_lights_its_band_and_the_levels() {
        let mut s = State::new(48_000);
        s.push(&sine(1000.0, 48_000, 4096, 0.5, 0));
        s.analyze(Instant::now());
        let f = &s.frame;
        let band = loudest_band(f);
        let (start, end) = band_bins(48_000)[band];
        let bin_hz = 48_000.0 / WINDOW as f32;
        assert!(
            (start as f32 * bin_hz) <= 1100.0 && (end as f32 * bin_hz) >= 900.0,
            "band {band}: {start}..{end}"
        );
        assert!(f.bands[band] > 0.8, "{}", f.bands[band]);
        assert!(f.bands[0] < 0.3, "low band stays dark: {}", f.bands[0]);
        assert!(
            (f.peak[0] - 0.5).abs() < 0.01 && (f.peak[1] - 0.25).abs() < 0.01,
            "{:?}",
            f.peak
        );
        assert!((f.rms[0] - 0.5 / 2f32.sqrt()).abs() < 0.01, "{:?}", f.rms);
        assert!(f.waveform.iter().any(|s| s.abs() > 0.3));
    }

    #[test]
    fn bands_fall_and_peaks_hold_then_fall() {
        let mut s = State::new(48_000);
        let t0 = Instant::now();
        s.push(&sine(440.0, 48_000, 4096, 0.8, 0));
        s.analyze(t0);
        let band = loudest_band(&s.frame);
        let top = s.frame.bands[band];
        // Silence: bands fall immediately, peaks hold for PEAK_HOLD.
        s.push(&vec![0.0; WINDOW * 2]);
        s.analyze(t0 + Duration::from_millis(100));
        assert!(s.frame.bands[band] < top);
        assert_eq!(s.frame.band_peaks[band], top);
        s.analyze(t0 + Duration::from_millis(700));
        assert!(s.frame.band_peaks[band] < top);
        assert_eq!(s.frame.peak, [0.0, 0.0]);
        // Ticks without audio let the levels fall smoothly.
        s.push(&sine(440.0, 48_000, 480, 0.8, 0));
        s.analyze(t0 + Duration::from_millis(717));
        s.analyze(t0 + Duration::from_millis(734));
        assert!(
            s.frame.peak[0] > 0.5 && s.frame.peak[0] < 0.8,
            "{:?}",
            s.frame.peak
        );
    }

    #[test]
    fn onset_rises_on_a_sudden_attack() {
        let mut s = State::new(48_000);
        let t0 = Instant::now();
        for i in 0..20 {
            s.push(&sine(200.0, 48_000, 800, 0.01, i * 800));
            s.analyze(t0 + TICK * i as u32);
        }
        assert!(s.frame.onset < 0.2);
        let noise: Vec<f32> = (0..1600)
            .map(|i| if i % 3 == 0 { 0.9 } else { -0.7 })
            .collect();
        s.push(&noise);
        s.analyze(t0 + TICK * 21);
        assert!(s.frame.onset > 0.5, "{}", s.frame.onset);
    }

    #[test]
    fn bands_cover_the_range_in_order() {
        for rate in [22_050, 44_100, 48_000, 96_000] {
            let bins = band_bins(rate);
            assert_eq!(bins.len(), BANDS);
            for w in bins.windows(2) {
                assert!(w[0].0 < w[0].1 && w[0].1 <= w[1].0 + 1, "{rate}: {w:?}");
            }
            assert!(bins.last().unwrap().1 <= WINDOW / 2);
        }
    }

    #[test]
    fn analyzer_thread_publishes_and_disconnects() {
        let hub = VisHub::new();
        assert!(!hub.is_active());
        let (analyzer, mut tap) = Analyzer::start(hub.clone(), 48_000);
        assert!(hub.is_active());
        for i in 0..10 {
            tap.push_stereo(&sine(1000.0, 48_000, 960, 0.5, i * 960));
            std::thread::sleep(Duration::from_millis(20));
        }
        let (peak, _) = hub.levels();
        assert!(peak[0] > 0.4, "{peak:?}");
        drop(analyzer);
        assert!(!hub.is_active());
        assert_eq!(hub.levels(), ([0.0; 2], [0.0; 2]));
        // A full ring drops audio instead of blocking.
        let (_analyzer, mut tap) = Analyzer::start(hub.clone(), 48_000);
        tap.push_stereo(&vec![0.1; RING_FRAMES * 4]);
    }
}

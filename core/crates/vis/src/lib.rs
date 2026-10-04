//! Sound Scraper's visualizer.
//!
//! While recording (or paused), the recorder's encoder thread pushes the
//! captured audio into a lock-free ring ([`Tap`]); an analyzer thread drains
//! it ~60 times a second and publishes a [`Frame`] (spectrum bands with
//! peaks, waveform, levels, onset) through a triple buffer. The UI's
//! visualizer view asks a [`render::Renderer`] to draw the latest frame
//! into an RGBA buffer, so no audio data passes through JavaScript.

pub mod analyzer;
pub mod render;

use std::sync::{Arc, Mutex};

pub use analyzer::{Analyzer, Tap};

/// Number of log-spaced spectrum bands the analyzer produces (presets with
/// fewer bars combine them).
pub const BANDS: usize = 64;
/// Waveform samples per frame.
pub const WAVEFORM: usize = 512;

/// One analysis of the most recent audio.
#[derive(Debug, Clone, PartialEq)]
pub struct Frame {
    /// Spectrum bands, low to high, 0..1 (−70..0 dB), smoothed.
    pub bands: Vec<f32>,
    /// Held peaks of `bands`, falling back after a moment.
    pub band_peaks: Vec<f32>,
    /// The last [`WAVEFORM`] mono samples, −1..1.
    pub waveform: Vec<f32>,
    /// Linear peak and RMS levels since the last frame, [left, right].
    pub peak: [f32; 2],
    pub rms: [f32; 2],
    /// 0..1: how much the spectrum jumped compared with the recent average
    /// (a beat / onset signal).
    pub onset: f32,
}

impl Default for Frame {
    fn default() -> Self {
        Self {
            bands: vec![0.0; BANDS],
            band_peaks: vec![0.0; BANDS],
            waveform: vec![0.0; WAVEFORM],
            peak: [0.0; 2],
            rms: [0.0; 2],
            onset: 0.0,
        }
    }
}

/// Where the current analyzer publishes; shared by the recorder and every
/// visualizer view. Empty while no recording is running.
#[derive(Default)]
pub struct VisHub {
    output: Mutex<Option<triple_buffer::Output<Frame>>>,
}

impl VisHub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub(crate) fn connect(&self, output: triple_buffer::Output<Frame>) {
        *self.output.lock().unwrap_or_else(|e| e.into_inner()) = Some(output);
    }

    pub(crate) fn disconnect(&self) {
        *self.output.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    /// Whether an analyzer is running (a recording is active or paused).
    pub fn is_active(&self) -> bool {
        self.output.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }

    /// Runs `f` on the latest frame, if an analyzer is running.
    pub fn with_latest<T>(&self, f: impl FnOnce(&Frame) -> T) -> Option<T> {
        let mut guard = self.output.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_mut().map(|output| f(output.read()))
    }

    /// The latest levels: (peak, rms), each [left, right].
    pub fn levels(&self) -> ([f32; 2], [f32; 2]) {
        self.with_latest(|f| (f.peak, f.rms)).unwrap_or_default()
    }
}

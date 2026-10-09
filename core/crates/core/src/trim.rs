//! Trims leading and trailing silence from a recording as it streams to the
//! encoder (the "Trim silence" setting).
//!
//! Leading silence is dropped until the first audible sample. Afterwards,
//! quiet stretches are held back instead of encoded; they're written once
//! audio resumes (so silence inside a recording is kept) and dropped when the
//! recording stops. A short margin is kept on both ends so sounds don't start
//! or end abruptly.

use std::time::Duration;

/// Samples at or below this level (-60 dBFS) count as silence.
pub const THRESHOLD: f32 = 0.001;
/// Kept before the first and after the last audible sample.
pub const MARGIN: Duration = Duration::from_millis(100);
/// Held-back silence beyond this much is kept as a count and written back as
/// digital silence, so a long quiet stretch doesn't grow memory without bound.
const MAX_HELD: Duration = Duration::from_secs(30);

/// Works on interleaved stereo.
pub struct SilenceTrimmer {
    margin_frames: usize,
    max_held_frames: usize,
    /// Audio has been heard (leading silence is over).
    started: bool,
    /// Silence since the last audible sample (or the last `MARGIN` of
    /// leading silence).
    held: Vec<f32>,
    /// Held silence beyond `MAX_HELD`, in frames.
    overflow_frames: u64,
}

impl SilenceTrimmer {
    pub fn new(sample_rate: u32) -> Self {
        let frames = |d: Duration| (d.as_secs_f64() * f64::from(sample_rate)) as usize;
        Self {
            margin_frames: frames(MARGIN),
            max_held_frames: frames(MAX_HELD),
            started: false,
            held: Vec::new(),
            overflow_frames: 0,
        }
    }

    /// True once audible audio has arrived.
    pub fn heard_audio(&self) -> bool {
        self.started
    }

    /// Frames held back after audio was heard: the length the recording
    /// grows by if audio resumes.
    pub fn held_frames(&self) -> u64 {
        if self.started {
            (self.held.len() / 2) as u64 + self.overflow_frames
        } else {
            0
        }
    }

    /// Takes a chunk; appends what should be encoded now to `out`.
    pub fn push(&mut self, stereo: &[f32], out: &mut Vec<f32>) {
        let audible = |f: &[f32]| f.iter().any(|s| s.abs() > THRESHOLD);
        let frames: Vec<&[f32]> = stereo.as_chunks::<2>().0.iter().map(|f| &f[..]).collect();
        let Some(first) = frames.iter().position(|f| audible(f)) else {
            self.hold(stereo);
            return;
        };
        let last = frames.iter().rposition(|f| audible(f)).unwrap_or(first);
        self.hold(&stereo[..first * 2]);
        // Before the first sound, only the margin of leading silence is held.
        out.append(&mut self.held);
        out.resize(out.len() + self.overflow_frames as usize * 2, 0.0);
        self.overflow_frames = 0;
        self.started = true;
        out.extend_from_slice(&stereo[first * 2..(last + 1) * 2]);
        self.held.extend_from_slice(&stereo[(last + 1) * 2..]);
    }

    /// Ends the recording: appends the trailing margin to `out` and drops
    /// the rest of the held silence.
    pub fn finish(&mut self, out: &mut Vec<f32>) {
        if self.started {
            let keep = self.held.len().min(self.margin_frames * 2);
            out.extend_from_slice(&self.held[..keep]);
        }
        self.held.clear();
        self.overflow_frames = 0;
    }

    fn hold(&mut self, silence: &[f32]) {
        self.held.extend_from_slice(silence);
        let limit = if self.started {
            self.max_held_frames
        } else {
            self.margin_frames
        } * 2;
        if self.held.len() > limit {
            let excess = self.held.len() - limit;
            if self.started {
                // Keep the first MAX_HELD as captured; count the rest.
                self.held.truncate(limit);
                self.overflow_frames += (excess / 2) as u64;
            } else {
                self.held.drain(..excess);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1000; // 1 frame = 1 ms; MARGIN = 100 frames

    fn frames(n: usize, level: f32) -> Vec<f32> {
        vec![level; n * 2]
    }

    fn run(chunks: &[Vec<f32>]) -> Vec<f32> {
        let mut t = SilenceTrimmer::new(RATE);
        let mut out = Vec::new();
        for c in chunks {
            t.push(c, &mut out);
        }
        t.finish(&mut out);
        out
    }

    #[test]
    fn trims_both_ends_keeping_a_margin() {
        let out = run(&[frames(500, 0.0), frames(50, 0.5), frames(400, 0.0)]);
        assert_eq!(out.len(), (100 + 50 + 100) * 2);
        assert!(out[..200].iter().all(|&s| s == 0.0));
        assert!(out[200..300].iter().all(|&s| s == 0.5));
    }

    #[test]
    fn keeps_silence_between_sounds() {
        let out = run(&[frames(10, 0.5), frames(300, 0.0005), frames(10, 0.5)]);
        assert_eq!(
            out.len(),
            (10 + 300 + 10) * 2,
            "the quiet stretch is kept as captured"
        );
        assert!(out[20..620].iter().all(|&s| s == 0.0005));
    }

    #[test]
    fn finds_sound_inside_a_chunk() {
        let mut chunk = frames(200, 0.0);
        chunk.extend(frames(5, -0.3));
        chunk.extend(frames(200, 0.0));
        let out = run(&[chunk]);
        assert_eq!(out.len(), (100 + 5 + 100) * 2);
    }

    #[test]
    fn short_silence_keeps_all_of_it() {
        let out = run(&[frames(30, 0.0), frames(10, 0.5), frames(20, 0.0)]);
        assert_eq!(out.len(), 60 * 2);
    }

    #[test]
    fn only_silence_gives_nothing() {
        let mut t = SilenceTrimmer::new(RATE);
        let mut out = Vec::new();
        t.push(&frames(5000, 0.0005), &mut out);
        t.finish(&mut out);
        assert!(out.is_empty() && !t.heard_audio());
    }

    #[test]
    fn long_held_silence_is_capped_but_restored() {
        let mut t = SilenceTrimmer::new(RATE);
        let mut out = Vec::new();
        t.push(&frames(1, 0.5), &mut out);
        for _ in 0..40 {
            t.push(&frames(1000, 0.0005), &mut out); // 40 s of quiet
        }
        assert_eq!(t.held.len(), 30_000 * 2, "memory is capped at MAX_HELD");
        assert_eq!(t.held_frames(), 40_000);
        t.push(&frames(1, 0.5), &mut out);
        assert_eq!(out.len(), (1 + 40_000 + 1) * 2, "the timeline is preserved");
        assert!(
            out[out.len() - 2 - 10_000 * 2..out.len() - 2]
                .iter()
                .all(|&s| s == 0.0)
        );
    }
}

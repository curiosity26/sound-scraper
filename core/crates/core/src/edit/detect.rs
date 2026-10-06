//! Find Tracks (docs/track-editor-design.md §5): proposes splices in the
//! silences between songs, from the waveform summary's RMS (about 5 ms per
//! bucket), so it needs no extra decoding.

use serde::{Deserialize, Serialize};

use super::peaks::{BUCKET, Peaks};

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DetectOptions {
    /// Quieter than this (RMS, dBFS) is silence.
    pub threshold_db: f64,
    /// Silences shorter than this are pauses inside a song.
    pub min_gap_ms: f64,
    /// No track shorter than this.
    pub min_track_ms: f64,
    /// Propose deleting each gap (keeping a short margin either side).
    pub remove_gaps: bool,
}

impl Default for DetectOptions {
    fn default() -> Self {
        Self { threshold_db: -60.0, min_gap_ms: 1500.0, min_track_ms: 10_000.0, remove_gaps: false }
    }
}

/// A proposed splice in a gap, all in ms.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub at_ms: f64,
    pub gap_start_ms: f64,
    pub gap_end_ms: f64,
    /// With `remove_gaps`: the stretch to delete.
    pub delete: Option<(f64, f64)>,
}

/// The splice sits this far before the sound resumes, so each track starts
/// with a breath of silence and the one before keeps its tail.
const LEAD_IN_MS: f64 = 200.0;
/// Kept either side of a removed gap (as `trim.rs` keeps).
const MARGIN_MS: f64 = 100.0;

pub fn detect(peaks: &Peaks, opts: &DetectOptions) -> Vec<Proposal> {
    let ms_per_bucket = BUCKET as f64 * 1000.0 / f64::from(peaks.rate);
    let total_ms = peaks.frames as f64 * 1000.0 / f64::from(peaks.rate);
    let threshold = (10f64.powf(opts.threshold_db / 20.0) * 32767.0) as i32;
    let silent = |i: usize| i32::from(peaks.buckets[i].rms) <= threshold;

    // Silent runs, in bucket indices.
    let mut gaps = Vec::new();
    let mut i = 0;
    let n = peaks.buckets.len();
    while i < n {
        if !silent(i) {
            i += 1;
            continue;
        }
        let start = i;
        while i < n && silent(i) {
            i += 1;
        }
        // Leading and trailing silence of the whole file aren't gaps.
        if start == 0 || i == n {
            continue;
        }
        let (a, b) = (start as f64 * ms_per_bucket, i as f64 * ms_per_bucket);
        if b - a >= opts.min_gap_ms {
            gaps.push((a, b));
        }
    }

    // Longest gaps first: each is kept if its track boundaries stay at
    // least the minimum track length from those already kept.
    gaps.sort_by(|x, y| (y.1 - y.0).total_cmp(&(x.1 - x.0)));
    let mut kept: Vec<Proposal> = Vec::new();
    for (a, b) in gaps {
        let at = if opts.remove_gaps { b - MARGIN_MS } else { (b - LEAD_IN_MS).max(a) };
        let far_enough = at >= opts.min_track_ms
            && total_ms - at >= opts.min_track_ms
            && kept.iter().all(|p| (p.at_ms - at).abs() >= opts.min_track_ms);
        if far_enough {
            let delete = (opts.remove_gaps && b - a > 2.0 * MARGIN_MS).then_some((a + MARGIN_MS, b - MARGIN_MS));
            kept.push(Proposal { at_ms: at, gap_start_ms: a, gap_end_ms: b, delete });
        }
    }
    kept.sort_by(|x, y| x.at_ms.total_cmp(&y.at_ms));
    kept
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edit::peaks::Bucket;

    /// A summary at 1 bucket = 10 ms: `(loud?, ms)` stretches.
    fn peaks(parts: &[(bool, u64)]) -> Peaks {
        let rate = (BUCKET * 100) as u32; // 100 buckets per second
        let mut buckets = Vec::new();
        for &(loud, ms) in parts {
            let v = if loud { 8000 } else { 10 }; // about -12 dB / -70 dB
            buckets.extend((0..ms / 10).map(|_| Bucket { min: -v, max: v, rms: v }));
        }
        let frames = buckets.len() as u64 * BUCKET;
        Peaks { rate, frames, buckets }
    }

    #[test]
    fn finds_gaps_between_songs() {
        let p = peaks(&[(false, 500), (true, 60_000), (false, 2000), (true, 50_000), (false, 3000), (true, 40_000), (false, 900)]);
        let found = detect(&p, &DetectOptions::default());
        let at: Vec<f64> = found.iter().map(|x| x.at_ms.round()).collect();
        assert_eq!(at, vec![500.0 + 60_000.0 + 2000.0 - 200.0, 500.0 + 60_000.0 + 2000.0 + 50_000.0 + 3000.0 - 200.0]);
        assert!(found.iter().all(|x| x.delete.is_none()));
    }

    #[test]
    fn short_pauses_and_short_tracks_are_ignored() {
        // A 1 s pause (too short a gap) and a 3 s "track" (too short).
        let p = peaks(&[(true, 40_000), (false, 1000), (true, 40_000), (false, 2000), (true, 3000), (false, 4000), (true, 40_000)]);
        let found = detect(&p, &DetectOptions::default());
        assert_eq!(found.len(), 1, "{found:?}");
        assert!((found[0].gap_end_ms - found[0].gap_start_ms - 4000.0).abs() < 1.0, "the longer gap wins");
    }

    #[test]
    fn a_short_last_track_is_found() {
        // Alex's test recording: 42 s, 35 s, then 25 s.
        let p = peaks(&[(true, 42_000), (false, 2700), (true, 35_000), (false, 2700), (true, 25_000)]);
        assert_eq!(detect(&p, &DetectOptions::default()).len(), 2);
    }

    #[test]
    fn remove_gaps_proposes_deletions_with_margins() {
        let p = peaks(&[(true, 40_000), (false, 2000), (true, 40_000)]);
        let found = detect(&p, &DetectOptions { remove_gaps: true, ..Default::default() });
        assert_eq!(found[0].delete, Some((40_100.0, 41_900.0)));
        assert_eq!(found[0].at_ms, 41_900.0);
    }

    #[test]
    fn threshold_decides_what_is_silence() {
        let p = peaks(&[(true, 40_000), (false, 2000), (true, 40_000)]);
        let strict = DetectOptions { threshold_db: -80.0, ..Default::default() };
        assert!(detect(&p, &strict).is_empty(), "-70 dB isn't silent at -80");
    }
}

//! Waveform summary (docs/track-editor-design.md §7.1): min, max and RMS of
//! every 256 frames, both channels together, from one decoding pass. Cached
//! in the app's data folder, keyed by the file's path, size and modified
//! time, so reopening a recording is instant.

use std::{
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::UNIX_EPOCH,
};

use crate::{paths, player::Source};

pub const BUCKET: u64 = 256;
const MAGIC: &[u8; 8] = b"SSPEAKS1";

/// One bucket: min and max sample, and RMS, scaled to i16.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Bucket {
    pub min: i16,
    pub max: i16,
    pub rms: i16,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Peaks {
    pub rate: u32,
    /// Presentation frames.
    pub frames: u64,
    pub buckets: Vec<Bucket>,
}

fn to_i16(v: f32) -> i16 {
    (v.clamp(-1.0, 1.0) * 32767.0).round() as i16
}

impl Peaks {
    /// Decodes `path`. `progress` gets 0..=1; returns an error if `cancel`
    /// is set.
    pub fn build(path: &Path, progress: &dyn Fn(f32), cancel: &AtomicBool) -> Result<Self, String> {
        let mut source = Source::open(path)?;
        let expected = source.n_frames.unwrap_or(0).max(1);
        let mut buckets = Vec::with_capacity((expected / BUCKET + 1) as usize);
        let mut buf = Vec::new();
        let (mut lo, mut hi, mut sq, mut n) = (f32::MAX, f32::MIN, 0f64, 0u64);
        let mut frames = 0u64;
        let mut last_report = 0u64;
        while source.decode(&mut buf) {
            if cancel.load(Ordering::Relaxed) {
                return Err("cancelled".into());
            }
            for f in buf.as_chunks::<2>().0 {
                lo = lo.min(f[0]).min(f[1]);
                hi = hi.max(f[0]).max(f[1]);
                sq += (f64::from(f[0]) * f64::from(f[0]) + f64::from(f[1]) * f64::from(f[1])) / 2.0;
                n += 1;
                if n == BUCKET {
                    buckets.push(Bucket {
                        min: to_i16(lo),
                        max: to_i16(hi),
                        rms: to_i16((sq / n as f64).sqrt() as f32),
                    });
                    (lo, hi, sq, n) = (f32::MAX, f32::MIN, 0.0, 0);
                }
            }
            frames += (buf.len() / 2) as u64;
            buf.clear();
            if frames - last_report > u64::from(source.rate) * 10 {
                last_report = frames;
                progress((frames as f32 / expected as f32).min(1.0));
            }
        }
        if n > 0 {
            buckets.push(Bucket {
                min: to_i16(lo),
                max: to_i16(hi),
                rms: to_i16((sq / n as f64).sqrt() as f32),
            });
        }
        progress(1.0);
        Ok(Self {
            rate: source.rate,
            frames,
            buckets,
        })
    }

    /// From the cache, or built (and cached).
    pub fn load_or_build(
        path: &Path,
        progress: &dyn Fn(f32),
        cancel: &AtomicBool,
    ) -> Result<Self, String> {
        let cache = cache_path(path);
        if let Some(cached) = cache.as_deref().and_then(|c| Self::read(c).ok()) {
            return Ok(cached);
        }
        let peaks = Self::build(path, progress, cancel)?;
        if let Some(cache) = cache {
            let _ = peaks.write(&cache);
        }
        Ok(peaks)
    }

    /// (min, max, rms) over frames `a..b`, from the buckets they touch.
    pub fn range(&self, a: f64, b: f64) -> Option<(f32, f32, f32)> {
        let first = (a.max(0.0) / BUCKET as f64) as usize;
        let last = ((b / BUCKET as f64).ceil() as usize).min(self.buckets.len());
        if first >= last {
            return None;
        }
        let mut lo = i16::MAX;
        let mut hi = i16::MIN;
        let mut sq = 0f64;
        for b in &self.buckets[first..last] {
            lo = lo.min(b.min);
            hi = hi.max(b.max);
            sq += f64::from(b.rms) * f64::from(b.rms);
        }
        let s = 1.0 / 32767.0;
        Some((
            f32::from(lo) * s,
            f32::from(hi) * s,
            ((sq / (last - first) as f64).sqrt() as f32) * s,
        ))
    }

    fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut out = Vec::with_capacity(24 + self.buckets.len() * 6);
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&self.rate.to_le_bytes());
        out.extend_from_slice(&self.frames.to_le_bytes());
        out.extend_from_slice(&(self.buckets.len() as u32).to_le_bytes());
        for b in &self.buckets {
            for v in [b.min, b.max, b.rms] {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }
        let temp = path.with_extension("tmp");
        std::fs::File::create(&temp)?.write_all(&out)?;
        std::fs::rename(temp, path)
    }

    fn read(path: &Path) -> std::io::Result<Self> {
        let mut data = Vec::new();
        std::fs::File::open(path)?.read_to_end(&mut data)?;
        let bad = || std::io::Error::new(std::io::ErrorKind::InvalidData, "bad peaks file");
        if data.len() < 24 || &data[..8] != MAGIC {
            return Err(bad());
        }
        let rate = u32::from_le_bytes(data[8..12].try_into().unwrap());
        let frames = u64::from_le_bytes(data[12..20].try_into().unwrap());
        let count = u32::from_le_bytes(data[20..24].try_into().unwrap()) as usize;
        if data.len() != 24 + count * 6 {
            return Err(bad());
        }
        let v = |i: usize| i16::from_le_bytes([data[i], data[i + 1]]);
        let buckets = (0..count)
            .map(|i| 24 + i * 6)
            .map(|o| Bucket {
                min: v(o),
                max: v(o + 2),
                rms: v(o + 4),
            })
            .collect();
        Ok(Self {
            rate,
            frames,
            buckets,
        })
    }
}

fn cache_path(path: &Path) -> Option<PathBuf> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (path, meta.len(), mtime).hash(&mut h);
    Some(
        paths::editor_data_dir()
            .join("Peaks")
            .join(format!("{:016x}.peaks", h.finish())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarizes_and_round_trips() {
        let dir = paths::tempdir();
        let rate = 48000;
        // 1 s of silence, then 1 s at ±0.5.
        let mut samples = vec![0.0f32; rate as usize * 2];
        samples.extend((0..rate).flat_map(|i| {
            let v = if (i / 50) % 2 == 0 { 0.5 } else { -0.5 };
            [v, v]
        }));
        let path = dir.join("a.mp3");
        std::fs::write(&path, crate::mp3::tests::encode_all(&samples, rate, true)).unwrap();
        let peaks = Peaks::build(&path, &|_| {}, &AtomicBool::new(false)).unwrap();
        assert_eq!(peaks.rate, rate);
        assert_eq!(peaks.frames, 2 * u64::from(rate));
        assert_eq!(peaks.buckets.len() as u64, peaks.frames.div_ceil(BUCKET));
        let (lo, hi, rms) = peaks.range(0.0, 40_000.0).unwrap();
        assert!(
            lo > -0.02 && hi < 0.02 && rms < 0.01,
            "silence: {lo} {hi} {rms}"
        );
        let (lo, hi, rms) = peaks.range(52_000.0, 90_000.0).unwrap();
        assert!(lo < -0.4 && hi > 0.4 && rms > 0.3, "loud: {lo} {hi} {rms}");

        let file = dir.join("p.peaks");
        peaks.write(&file).unwrap();
        assert_eq!(Peaks::read(&file).unwrap(), peaks);
        assert!(
            Peaks::build(&path, &|_| {}, &AtomicBool::new(true)).is_err(),
            "cancels"
        );
    }
}

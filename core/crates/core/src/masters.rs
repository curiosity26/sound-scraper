//! Lossless masters (docs/track-editor-design.md §6.1): a FLAC copy of each
//! recording, written alongside the MP3, so the track editor can cut at the
//! exact sample and encode each track once from lossless audio.
//!
//! Masters live in the app's data folder (`Masters/<recording>.mp3.flac`),
//! not the recordings folder. Short recordings drop theirs when they stop;
//! the rest share a size budget and an age limit, oldest (least recently
//! edited) first. A master goes when its recording is trashed or replaced
//! by its tracks. Without a master the editor still works, cutting the MP3.

use std::{
    fs::File,
    io::{BufWriter, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use flacenc::{
    bitsink::ByteSink,
    component::{BitRepr, StreamInfo},
    config,
    error::Verify,
    source::{Context, Fill, FrameBuf},
};

use crate::paths;

const EXT: &str = ".flac";
const PART: &str = ".flac.part";
const BLOCK: usize = 4096;
const BITS: usize = 16;

/// When masters are kept (from the settings).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Policy {
    pub keep: bool,
    /// Shorter recordings drop their master when they stop.
    pub min_length: Duration,
    /// All masters together stay under this.
    pub budget_bytes: u64,
    /// Masters not edited for this long are removed.
    pub max_age: Duration,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            keep: true,
            min_length: Duration::from_secs(20 * 60),
            budget_bytes: 10 * 1024 * 1024 * 1024,
            max_age: Duration::from_secs(30 * 24 * 3600),
        }
    }
}

pub fn dir() -> PathBuf {
    paths::editor_data_dir().join("Masters")
}

/// Where the master for the recording `file_name` lives.
pub fn path_for(dir: &Path, file_name: &str) -> PathBuf {
    dir.join(format!("{}{EXT}", paths::sanitize(file_name)))
}

/// The master for `file_name`, if there is one.
pub fn find(file_name: &str) -> Option<PathBuf> {
    let path = path_for(&dir(), file_name);
    path.is_file().then_some(path)
}

/// Marks a master as just used (so cleanup keeps it longer).
pub fn touch(path: &Path) {
    if let Ok(file) = File::options().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

/// Keeps a master with its recording when the recording is renamed.
pub fn rename(old: &str, new: &str) {
    let d = dir();
    let from = path_for(&d, old);
    if from.exists() {
        let _ = std::fs::rename(from, path_for(&d, new));
    }
}

pub fn remove(file_name: &str) {
    let _ = std::fs::remove_file(path_for(&dir(), file_name));
}

/// (count, bytes) of the masters kept.
pub fn usage() -> (usize, u64) {
    masters_in(&dir())
        .iter()
        .fold((0, 0), |(n, b), m| (n + 1, b + m.1))
}

pub fn remove_all() -> Result<(), String> {
    for (path, _, _) in masters_in(&dir()) {
        std::fs::remove_file(&path).map_err(|e| format!("removing {}: {e}", path.display()))?;
    }
    Ok(())
}

/// Removes masters left half-written by a crash.
pub fn remove_partials() {
    if let Ok(entries) = std::fs::read_dir(dir()) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().ends_with(PART) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

/// (path, bytes, last used), oldest first.
fn masters_in(dir: &Path) -> Vec<(PathBuf, u64, SystemTime)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<_> = entries
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(EXT))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((
                e.path(),
                meta.len(),
                meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            ))
        })
        .collect();
    found.sort_by_key(|m| m.2);
    found
}

/// Applies the age limit and the budget; returns how many were removed.
pub fn cleanup(policy: &Policy) -> usize {
    cleanup_in(&dir(), policy, SystemTime::now())
}

fn cleanup_in(dir: &Path, policy: &Policy, now: SystemTime) -> usize {
    let mut masters = masters_in(dir);
    let mut removed = 0;
    let mut total: u64 = masters.iter().map(|m| m.1).sum();
    masters.retain(|(path, bytes, used)| {
        let too_old = now.duration_since(*used).unwrap_or_default() > policy.max_age;
        if (too_old || !policy.keep) && std::fs::remove_file(path).is_ok() {
            total -= bytes;
            removed += 1;
            return false;
        }
        true
    });
    for (path, bytes, _) in masters {
        if total <= policy.budget_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= bytes;
            removed += 1;
        }
    }
    removed
}

/// Streams 16-bit stereo FLAC to `<dir>/<name>.flac.part`.
pub struct MasterWriter {
    part: PathBuf,
    file: BufWriter<File>,
    config: flacenc::error::Verified<config::Encoder>,
    info: StreamInfo,
    ctx: Context,
    pending: Vec<i32>,
    frames: usize,
    sink: ByteSink,
}

impl MasterWriter {
    /// Starts a master for a recording whose (part) file is named `name`.
    pub fn create(dir: &Path, name: &str, rate: u32) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
        let part = dir.join(format!("{}{PART}", paths::sanitize(name)));
        let mut file = BufWriter::new(
            File::create(&part).map_err(|e| format!("creating {}: {e}", part.display()))?,
        );
        let info = StreamInfo::new(rate as usize, 2, BITS).map_err(|e| format!("FLAC: {e:?}"))?;
        // "fLaC", then STREAMINFO as the last metadata block (filled in at the end).
        file.write_all(b"fLaC\x80\x00\x00\x22")
            .map_err(|e| e.to_string())?;
        file.write_all(&[0u8; 34]).map_err(|e| e.to_string())?;
        let config = config::Encoder::default()
            .into_verified()
            .map_err(|e| format!("FLAC: {e:?}"))?;
        Ok(Self {
            part,
            file,
            config,
            info,
            ctx: Context::new(BITS, 2),
            pending: Vec::with_capacity(BLOCK * 2),
            frames: 0,
            sink: ByteSink::new(),
        })
    }

    /// Adds interleaved stereo samples.
    pub fn push(&mut self, stereo: &[f32]) -> Result<(), String> {
        for &s in stereo {
            self.pending
                .push((s.clamp(-1.0, 1.0) * 32767.0).round() as i32);
            if self.pending.len() == BLOCK * 2 {
                self.flush_block()?;
            }
        }
        Ok(())
    }

    fn flush_block(&mut self) -> Result<(), String> {
        let n = self.pending.len() / 2;
        if n == 0 {
            return Ok(());
        }
        let mut fb = FrameBuf::with_size(2, n).map_err(|e| format!("FLAC: {e:?}"))?;
        (&mut fb, &mut self.ctx)
            .fill_interleaved(&self.pending)
            .map_err(|e| format!("FLAC: {e:?}"))?;
        let frame = flacenc::encode_fixed_size_frame(&self.config, &fb, self.frames, &self.info)
            .map_err(|e| format!("FLAC: {e:?}"))?;
        self.info.update_frame_info(&frame);
        self.sink.clear();
        frame
            .write(&mut self.sink)
            .map_err(|e| format!("FLAC: {e:?}"))?;
        self.file
            .write_all(self.sink.as_slice())
            .map_err(|e| format!("writing {}: {e}", self.part.display()))?;
        self.frames += 1;
        self.pending.clear();
        Ok(())
    }

    /// Writes what's left and the header; renames it to the master of the
    /// recording `file_name` (in the same folder) and returns its path.
    pub fn finish(mut self, file_name: &str) -> Result<PathBuf, String> {
        self.flush_block()?;
        self.info.set_md5_digest(&self.ctx.md5_digest());
        self.info.set_total_samples(self.ctx.total_samples());
        self.sink.clear();
        self.info
            .write(&mut self.sink)
            .map_err(|e| format!("FLAC: {e:?}"))?;
        // A fixed-blocksize stream's minimum block size is the block size
        // (only the last block may be shorter), which some decoders insist on.
        let mut header = self.sink.as_slice().to_vec();
        header[..2].copy_from_slice(&(BLOCK as u16).to_be_bytes());
        let err = |e: std::io::Error| format!("finishing {}: {e}", self.part.display());
        let mut file = self.file.into_inner().map_err(|e| err(e.into_error()))?;
        file.seek(SeekFrom::Start(8)).map_err(err)?;
        file.write_all(&header).map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file);
        let target = path_for(self.part.parent().unwrap_or(Path::new(".")), file_name);
        std::fs::rename(&self.part, &target)
            .map_err(|e| format!("renaming {}: {e}", self.part.display()))?;
        Ok(target)
    }

    /// Gives up on this master.
    pub fn discard(self) {
        drop(self.file);
        let _ = std::fs::remove_file(&self.part);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::player::Source;

    #[test]
    fn writes_a_flac_that_decodes_to_the_same_samples() {
        let dir = paths::tempdir();
        let rate = 44100;
        let samples: Vec<f32> = (0..10_000)
            .flat_map(|i| {
                [
                    (i as f32 * 0.01).sin() * 0.5,
                    (i as f32 * 0.013).cos() * 0.25,
                ]
            })
            .collect();
        let mut w = MasterWriter::create(&dir, "Song.mp3.part", rate).unwrap();
        for chunk in samples.chunks(882) {
            w.push(chunk).unwrap();
        }
        let path = w.finish("Song.mp3").unwrap();
        assert_eq!(path, dir.join("Song.mp3.flac"));
        assert!(!dir.join("Song.mp3.part.flac.part").exists());

        let mut s = Source::open(&path).unwrap();
        assert_eq!(s.n_frames, Some(10_000));
        let mut out = Vec::new();
        while s.decode(&mut out) {}
        assert_eq!(out.len(), samples.len());
        let worst = out
            .iter()
            .zip(&samples)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f32::max);
        assert!(worst <= 1.0 / 32767.0, "16-bit exact: {worst}");
    }

    #[test]
    fn cleanup_keeps_the_budget_and_age() {
        let dir = paths::tempdir();
        let now = SystemTime::now();
        let make = |name: &str, bytes: usize, age_days: u64| {
            let p = dir.join(format!("{name}{EXT}"));
            std::fs::write(&p, vec![0u8; bytes]).unwrap();
            File::options()
                .write(true)
                .open(&p)
                .unwrap()
                .set_modified(now - Duration::from_secs(age_days * 86_400))
                .unwrap();
        };
        make("ancient", 10, 40);
        make("old", 100, 5);
        make("mid", 100, 3);
        make("new", 100, 1);
        let policy = Policy {
            budget_bytes: 250,
            ..Policy::default()
        };
        assert_eq!(
            cleanup_in(&dir, &policy, now),
            2,
            "the 40-day one, then the oldest over budget"
        );
        let left: Vec<String> = masters_in(&dir)
            .iter()
            .map(|m| m.0.file_name().unwrap().to_string_lossy().into())
            .collect();
        assert_eq!(left, vec!["mid.flac", "new.flac"]);
        assert_eq!(
            cleanup_in(
                &dir,
                &Policy {
                    keep: false,
                    ..policy
                },
                now
            ),
            2,
            "off removes all"
        );
    }
}

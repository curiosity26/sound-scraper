//! Saving an edit: writes each track as its own MP3 next to the original
//! (docs/track-editor-design.md §4.7), tagged like the original except for
//! the title and track number.
//!
//! A track that is one unbroken stretch of the original is cut losslessly
//! (`mp3cut`). One with a deleted region inside it (or where the bit
//! reservoir rules out an exact lossless cut) is decoded and re-encoded at
//! the original's quality. Every track is written as `.part` and renamed
//! when complete; if anything fails, the tracks already written are removed
//! and the original is untouched.

use std::path::{Path, PathBuf};

use super::{
    edits::{EditList, TrackPlan},
    mp3cut::Mp3Index,
};
use crate::{
    mp3::Mp3Encoder,
    paths,
    player::Source,
    recorder::PART_EXT,
    settings::Quality,
    tags::{self, TagVersion},
};

/// What a save made.
#[derive(Debug, Clone, PartialEq)]
pub struct Saved {
    /// The new files, in track order.
    pub paths: Vec<PathBuf>,
    /// How many were re-encoded rather than cut losslessly.
    pub reencoded: usize,
}

/// Writes the tracks `edits` describe, from the MP3 at `original`, into the
/// original's folder. `progress` gets 0..=1.
pub fn save(original: &Path, edits: &EditList, version: TagVersion, progress: &dyn Fn(f32)) -> Result<Saved, String> {
    let data = std::fs::read(original).map_err(|e| format!("reading {}: {e}", original.display()))?;
    let index = Mp3Index::parse(&data)?;
    let rate = index.header.sample_rate;
    let plan = edits.plan(rate, index.presentation_frames());
    if plan.is_empty() {
        return Err("Nothing would be left: every part of the recording is deleted.".into());
    }
    let dir = original.parent().ok_or("the recording has no folder")?;
    let total = plan.len() as u32;
    let all_frames: u64 = plan.iter().map(TrackPlan::frames).sum();
    let mut done_frames = 0;
    let mut written: Vec<PathBuf> = Vec::new();
    let mut reencoded = 0;
    let result = (|| -> Result<(), String> {
        for (i, track) in plan.iter().enumerate() {
            let audio = match track.segments.as_slice() {
                [(a, b)] => index.cut(&data, *a, *b)?,
                _ => None,
            };
            let audio = match audio {
                Some(audio) => audio,
                None => {
                    reencoded += 1;
                    reencode(original, &track.segments, rate, quality_of(&index))?
                }
            };
            let tag = tags::track_tag_bytes(original, &track.name, i as u32 + 1, total, version)?;
            let stem = paths::sanitize(&track.name);
            let path = paths::unique_path(dir, &stem, ".mp3", &[PART_EXT]);
            let part = path.with_file_name(format!("{}{PART_EXT}", path.file_stem().unwrap().to_string_lossy()));
            let mut bytes = tag;
            bytes.extend_from_slice(&audio);
            std::fs::write(&part, &bytes).map_err(|e| format!("writing {}: {e}", part.display()))?;
            written.push(part.clone());
            std::fs::rename(&part, &path).map_err(|e| format!("writing {}: {e}", path.display()))?;
            *written.last_mut().unwrap() = path;
            done_frames += track.frames();
            progress(done_frames as f32 / all_frames.max(1) as f32);
        }
        Ok(())
    })();
    if let Err(e) = result {
        for path in &written {
            let _ = std::fs::remove_file(path);
        }
        return Err(e);
    }
    Ok(Saved { paths: written, reencoded })
}

/// The encoder setting closest to the original's.
fn quality_of(index: &Mp3Index) -> Quality {
    if index.is_cbr() {
        match index.bitrate_kbps() {
            0..=128 => Quality::Cbr128,
            129..=192 => Quality::Cbr192,
            193..=256 => Quality::Cbr256,
            _ => Quality::Cbr320,
        }
    } else {
        let bytes: usize = index.frames.iter().map(|f| f.len).sum();
        let seconds = index.frames.len() as f64 * index.samples_per_frame() as f64 / f64::from(index.header.sample_rate);
        let kbps = bytes as f64 * 8.0 / seconds.max(0.001) / 1000.0;
        if kbps > 220.0 { Quality::Vbr0 } else { Quality::Vbr2 }
    }
}

/// Decodes `segments` (presentation frames), joins them and encodes the
/// result with its LAME tag.
fn reencode(original: &Path, segments: &[(u64, u64)], rate: u32, quality: Quality) -> Result<Vec<u8>, String> {
    let mut source = Source::open(original)?;
    let mut encoder = Mp3Encoder::new(rate, quality)?;
    let mut out = Vec::new();
    let mut buf = Vec::new();
    for &(a, b) in segments {
        if !source.seek_frame(a) {
            return Err("couldn't seek in the recording".into());
        }
        let mut left = (b - a) as usize * 2;
        while left > 0 {
            buf.clear();
            if !source.decode(&mut buf) {
                break;
            }
            let take = buf.len().min(left);
            out.extend_from_slice(encoder.encode(&buf[..take])?);
            left -= take;
        }
    }
    out.extend_from_slice(encoder.flush()?);
    if let Some(tag) = encoder.lame_tag()
        && tag.len() <= out.len()
    {
        out[..tag.len()].copy_from_slice(&tag);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edit::edits::{Region, Splice};

    fn decode(path: &Path) -> Vec<f32> {
        let mut s = Source::open(path).unwrap();
        let mut out = Vec::new();
        while s.decode(&mut out) {}
        out
    }

    fn recording(dir: &Path) -> PathBuf {
        let rate = 48000;
        let samples: Vec<f32> = (0..rate * 6)
            .flat_map(|i| {
                let v = (i as f32 * 330.0 * std::f32::consts::TAU / rate as f32).sin() * 0.3;
                [v, v]
            })
            .collect();
        let audio = crate::mp3::tests::encode_all(&samples, rate, true);
        let path = dir.join("Album.mp3");
        std::fs::write(&path, &audio).unwrap();
        tags::write(
            &path,
            &tags::TagEdit {
                title: Some(Some("Album".into())),
                artist: Some(Some("Band".into())),
                album: Some(Some("Live".into())),
                ..Default::default()
            },
            TagVersion::V24,
        )
        .unwrap();
        path
    }

    #[test]
    fn writes_tagged_tracks_lossless_where_it_can() {
        let dir = paths::tempdir();
        let original = recording(&dir);
        let whole = decode(&original);
        let edits = EditList {
            first_name: "Opening".into(),
            splices: vec![Splice { at_ms: 2000.0, name: "Middle/Part".into() }, Splice { at_ms: 4000.0, name: "Album".into() }],
            deleted: vec![Region { start_ms: 2500.0, end_ms: 3000.0 }],
        };
        let saved = save(&original, &edits, TagVersion::V24, &|_| {}).unwrap();
        let names: Vec<String> = saved.paths.iter().map(|p| p.file_name().unwrap().to_string_lossy().into()).collect();
        assert_eq!(names, vec!["Opening.mp3", "Middle_Part.mp3", "Album (2).mp3"]);
        assert_eq!(saved.reencoded, 1, "only the track with a hole is re-encoded");

        let t = tags::read(&saved.paths[1]).unwrap();
        assert_eq!(t.title.as_deref(), Some("Middle/Part"));
        assert_eq!((t.artist.as_deref(), t.album.as_deref(), t.track), (Some("Band"), Some("Live"), Some(2)));

        // Lossless tracks decode to exactly the original's samples.
        let first = decode(&saved.paths[0]);
        assert_eq!(first.len(), 96_000 * 2);
        assert!(first.iter().zip(&whole).all(|(a, b)| (a - b).abs() < 1e-4));
        // The re-encoded one has the right length (1.5 s).
        assert_eq!(decode(&saved.paths[1]).len(), 72_000 * 2);
        assert!(original.exists(), "the original is left alone");
        assert!(!dir.read_dir().unwrap().any(|e| e.unwrap().file_name().to_string_lossy().ends_with(PART_EXT)));
    }

    #[test]
    fn nothing_left_is_an_error_and_writes_nothing() {
        let dir = paths::tempdir();
        let original = recording(&dir);
        let edits = EditList { deleted: vec![Region { start_ms: 0.0, end_ms: 10_000.0 }], ..Default::default() };
        assert!(save(&original, &edits, TagVersion::V24, &|_| {}).is_err());
        assert_eq!(dir.read_dir().unwrap().count(), 1);
    }
}

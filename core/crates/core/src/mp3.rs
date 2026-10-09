//! MP3 encoding through LAME, plus the frame-level helpers used to finalize
//! and recover files (docs/design.md §3, §4).
//!
//! LAME (LGPL) is currently compiled in statically by `mp3lame-sys`. Before
//! distribution it has to move to a separately shipped dynamic library (or
//! ship relinkable objects); see docs/development.md "Licensing".

use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
};

use mp3lame_encoder::{
    Bitrate, Builder, FlushGap, InterleavedPcm, Quality as LameQuality, VbrMode,
};

use crate::settings::Quality;

/// Input rates LAME accepts without resampling.
pub const SUPPORTED_RATES: [u32; 9] =
    [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

/// Stereo f32 → CBR MP3. The first frame LAME emits is a placeholder for the
/// Xing/LAME tag, which [`Mp3Encoder::lame_tag`] fills in at the end.
pub struct Mp3Encoder {
    inner: mp3lame_encoder::Encoder,
    out: Vec<u8>,
}

impl Mp3Encoder {
    pub fn new(sample_rate: u32, quality: Quality) -> Result<Self, String> {
        if !SUPPORTED_RATES.contains(&sample_rate) {
            return Err(format!(
                "{sample_rate} Hz is not supported yet (resampling isn't implemented)"
            ));
        }
        let lame_err = |e: mp3lame_encoder::BuildError| format!("LAME setup failed: {e:?}");
        let mut b = Builder::new().ok_or("LAME failed to initialize")?;
        b.set_num_channels(2).map_err(lame_err)?;
        b.set_sample_rate(sample_rate).map_err(lame_err)?;
        b.set_quality(LameQuality::Good).map_err(lame_err)?;
        b.set_to_write_vbr_tag(true).map_err(lame_err)?;
        let cbr = |b: &mut Builder, rate| b.set_brate(rate);
        match quality {
            Quality::Cbr128 => cbr(&mut b, Bitrate::Kbps128),
            Quality::Cbr192 => cbr(&mut b, Bitrate::Kbps192),
            Quality::Cbr256 => cbr(&mut b, Bitrate::Kbps256),
            Quality::Cbr320 => cbr(&mut b, Bitrate::Kbps320),
            Quality::Vbr0 | Quality::Vbr2 => {
                b.set_vbr_mode(VbrMode::Mtrh).map_err(lame_err)?;
                b.set_vbr_quality(if quality == Quality::Vbr0 {
                    LameQuality::Best
                } else {
                    LameQuality::NearBest
                })
            }
        }
        .map_err(lame_err)?;
        Ok(Self {
            inner: b.build().map_err(lame_err)?,
            out: Vec::new(),
        })
    }

    /// Encodes interleaved stereo samples; returns the MP3 bytes produced.
    pub fn encode(&mut self, interleaved_stereo: &[f32]) -> Result<&[u8], String> {
        self.out.clear();
        self.out.reserve(mp3lame_encoder::max_required_buffer_size(
            interleaved_stereo.len() / 2,
        ));
        self.inner
            .encode_to_vec(InterleavedPcm(interleaved_stereo), &mut self.out)
            .map_err(|e| format!("LAME encode failed: {e:?}"))?;
        Ok(&self.out)
    }

    /// Flushes buffered audio; returns the final MP3 bytes.
    pub fn flush(&mut self) -> Result<&[u8], String> {
        self.out.clear();
        self.out.reserve(7200);
        self.inner
            .flush_to_vec::<FlushGap>(&mut self.out)
            .map_err(|e| format!("LAME flush failed: {e:?}"))?;
        Ok(&self.out)
    }

    /// The Xing/LAME tag frame to write over the placeholder first frame.
    pub fn lame_tag(&self) -> Option<Vec<u8>> {
        let mut tag = Vec::with_capacity(self.inner.lame_tag_size());
        self.inner.lame_tag_encode_to_vec(&mut tag).map(|_| tag)
    }
}

/// One MPEG audio frame header (Layer III only).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameHeader {
    pub mpeg1: bool,
    pub sample_rate: u32,
    pub bitrate_kbps: u32,
    pub mono: bool,
    pub length: usize,
}

impl FrameHeader {
    pub fn parse(b: &[u8]) -> Option<Self> {
        if b.len() < 4 || b[0] != 0xFF || b[1] & 0xE0 != 0xE0 {
            return None;
        }
        let version = (b[1] >> 3) & 0b11; // 00 = 2.5, 10 = 2, 11 = 1
        let layer = (b[1] >> 1) & 0b11; // 01 = Layer III
        if version == 0b01 || layer != 0b01 {
            return None;
        }
        let mpeg1 = version == 0b11;
        const BR_V1: [u32; 15] = [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
        ];
        const BR_V2: [u32; 15] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
        let br_index = (b[2] >> 4) as usize;
        let sr_index = ((b[2] >> 2) & 0b11) as usize;
        if br_index == 0 || br_index == 15 || sr_index == 3 {
            return None;
        }
        let bitrate_kbps = if mpeg1 { BR_V1 } else { BR_V2 }[br_index];
        let sample_rate = [44100, 48000, 32000][sr_index]
            >> match version {
                0b11 => 0,
                0b10 => 1,
                _ => 2,
            };
        let padding = ((b[2] >> 1) & 1) as usize;
        let coefficient = if mpeg1 { 144 } else { 72 };
        let length = (coefficient * bitrate_kbps as usize * 1000) / sample_rate as usize + padding;
        Some(Self {
            mpeg1,
            sample_rate,
            bitrate_kbps,
            mono: b[3] >> 6 == 0b11,
            length,
        })
    }

    pub fn samples_per_frame(&self) -> u32 {
        if self.mpeg1 { 1152 } else { 576 }
    }

    /// Offset of the Xing/Info header inside the frame (after side info).
    pub fn xing_offset(&self) -> usize {
        4 + match (self.mpeg1, self.mono) {
            (true, false) => 32,
            (true, true) | (false, false) => 17,
            (false, true) => 9,
        }
    }
}

/// Layout of the MPEG frames in a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mp3Scan {
    /// Byte offset of the first frame (after any ID3v2 tag).
    pub audio_start: u64,
    /// Byte offset just past the last complete frame.
    pub audio_end: u64,
    pub first: Option<FrameHeader>,
    /// Complete frames, including a Xing/Info frame if present.
    pub frames: u64,
    /// The first frame carries a Xing/Info header.
    pub has_info_tag: bool,
    /// The first frame is LAME's still-empty tag placeholder.
    pub has_empty_tag_placeholder: bool,
}

impl Mp3Scan {
    /// Duration from the frame count (excluding the tag frame).
    pub fn duration_secs(&self) -> f64 {
        let Some(h) = self.first else { return 0.0 };
        let audio_frames =
            self.frames - u64::from(self.has_info_tag || self.has_empty_tag_placeholder);
        audio_frames as f64 * f64::from(h.samples_per_frame()) / f64::from(h.sample_rate)
    }
}

pub fn scan(path: &Path) -> io::Result<Mp3Scan> {
    let mut data = Vec::new();
    File::open(path)?.read_to_end(&mut data)?;
    Ok(scan_bytes(&data))
}

pub fn scan_bytes(data: &[u8]) -> Mp3Scan {
    let mut pos = id3v2_size(data);
    let audio_start = pos as u64;
    let mut scan = Mp3Scan {
        audio_start,
        audio_end: audio_start,
        first: None,
        frames: 0,
        has_info_tag: false,
        has_empty_tag_placeholder: false,
    };
    while let Some(h) = FrameHeader::parse(&data[pos.min(data.len())..]) {
        if pos + h.length > data.len() {
            break; // truncated final frame
        }
        if scan.first.is_none() {
            scan.first = Some(h);
            let tag = &data[pos + h.xing_offset()..pos + h.xing_offset() + 4];
            scan.has_info_tag = tag == b"Xing" || tag == b"Info";
            scan.has_empty_tag_placeholder = data[pos + 4..pos + h.length].iter().all(|&b| b == 0);
        }
        scan.frames += 1;
        pos += h.length;
        scan.audio_end = pos as u64;
    }
    scan
}

/// Size of a leading ID3v2 tag (0 if none).
fn id3v2_size(data: &[u8]) -> usize {
    if data.len() < 10 || &data[..3] != b"ID3" {
        return 0;
    }
    let size = data[6..10]
        .iter()
        .fold(0usize, |acc, &b| (acc << 7) | (b & 0x7F) as usize);
    let footer = if data[5] & 0x10 != 0 { 10 } else { 0 };
    10 + size + footer
}

/// Makes an interrupted recording playable: drops a truncated final frame
/// and fills LAME's empty placeholder with a minimal "Info" header so
/// players know the duration. Returns the result of a fresh scan.
pub fn repair(path: &Path) -> io::Result<Mp3Scan> {
    let before = scan(path)?;
    let Some(first) = before.first else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "no MP3 frames found",
        ));
    };
    let mut file = File::options().read(true).write(true).open(path)?;
    file.set_len(before.audio_end)?;
    if before.has_empty_tag_placeholder {
        let audio_frames = (before.frames - 1) as u32;
        let bytes = (before.audio_end - before.audio_start) as u32;
        let mut info = Vec::with_capacity(16);
        info.extend_from_slice(b"Info");
        info.extend_from_slice(&0x0000_0003u32.to_be_bytes()); // frames + bytes fields present
        info.extend_from_slice(&audio_frames.to_be_bytes());
        info.extend_from_slice(&bytes.to_be_bytes());
        file.seek(SeekFrom::Start(
            before.audio_start + first.xing_offset() as u64,
        ))?;
        file.write_all(&info)?;
    }
    file.sync_all()?;
    scan(path)
}

/// Writes `frame` over the first audio frame (LAME's tag placeholder).
pub fn write_first_frame(path: &Path, frame: &[u8]) -> io::Result<()> {
    let start = scan(path)?.audio_start;
    let mut file = File::options().write(true).open(path)?;
    file.seek(SeekFrom::Start(start))?;
    file.write_all(frame)?;
    file.sync_all()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn sine(seconds: f64, rate: u32) -> Vec<f32> {
        let frames = (seconds * f64::from(rate)) as usize;
        (0..frames)
            .flat_map(|i| {
                let v = (i as f32 * 440.0 * std::f32::consts::TAU / rate as f32).sin() * 0.5;
                [v, v]
            })
            .collect()
    }

    pub(crate) fn encode_all(samples: &[f32], rate: u32, with_tag: bool) -> Vec<u8> {
        let mut enc = Mp3Encoder::new(rate, Quality::Cbr192).unwrap();
        let mut out = enc.encode(samples).unwrap().to_vec();
        out.extend_from_slice(enc.flush().unwrap());
        if with_tag {
            let tag = enc.lame_tag().unwrap();
            out[..tag.len()].copy_from_slice(&tag);
        }
        out
    }

    #[test]
    fn encodes_with_lame_tag_and_correct_duration() {
        let data = encode_all(&sine(2.0, 48000), 48000, true);
        let s = scan_bytes(&data);
        let h = s.first.unwrap();
        assert_eq!((h.sample_rate, h.bitrate_kbps, h.mono), (48000, 192, false));
        assert!(s.has_info_tag);
        assert!(
            (s.duration_secs() - 2.0).abs() < 0.1,
            "duration {}",
            s.duration_secs()
        );
    }

    #[test]
    fn repairs_a_truncated_file_without_a_tag() {
        let mut data = encode_all(&sine(1.0, 44100), 44100, false);
        let junk = data[1000..1100].to_vec(); // half a frame's worth
        data.extend(junk);
        let dir = crate::paths::tempdir();
        let path = dir.join("broken.mp3.part");
        std::fs::write(&path, &data).unwrap();

        let before = scan(&path).unwrap();
        assert!(before.has_empty_tag_placeholder && !before.has_info_tag);
        let after = repair(&path).unwrap();
        assert!(after.has_info_tag);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), after.audio_end);
        assert!(
            (after.duration_secs() - 1.0).abs() < 0.1,
            "duration {}",
            after.duration_secs()
        );
    }

    #[test]
    fn vbr_has_a_xing_header_and_correct_duration() {
        let samples = sine(2.0, 48000);
        let mut enc = Mp3Encoder::new(48000, Quality::Vbr0).unwrap();
        let mut out = enc.encode(&samples).unwrap().to_vec();
        out.extend_from_slice(enc.flush().unwrap());
        let tag = enc.lame_tag().unwrap();
        out[..tag.len()].copy_from_slice(&tag);
        let s = scan_bytes(&out);
        assert!(s.has_info_tag);
        assert!(
            (s.duration_secs() - 2.0).abs() < 0.1,
            "duration {}",
            s.duration_secs()
        );
    }

    #[test]
    fn rejects_unsupported_rates() {
        assert!(Mp3Encoder::new(96000, Quality::Cbr192).is_err());
    }
}

//! Lossless MP3 cutting (docs/track-editor-design.md §6, option A).
//!
//! A piece is the source's frames copied byte for byte, behind a fresh
//! Xing/Info + LAME tag frame whose encoder delay and padding make
//! gapless-aware decoders (ours: Symphonia) start and stop at the exact
//! sample, even though the bytes are cut at frame boundaries.
//!
//! Positions are in *presentation* frames (samples per channel), the
//! timeline Symphonia decodes with gapless on, which is what the player and
//! the editor show. In the raw decoded stream, presentation frame `p` is at
//! `p + 529 + delay`: LAME's encoder delay from the tag plus the decoder's
//! own 529-sample delay.
//!
//! The bit reservoir: a frame's main data may start in earlier frames. A
//! piece starts early enough that the frame holding its first sample, and
//! the one before it (whose second half overlaps into it), decode fully.
//! The extra lead-in is covered by the encoder delay. The delay field is
//! 12 bits (up to about 3.5 frames); when the reservoir reaches further back
//! than that (it happens with low-bitrate VBR frames, never in our CBR
//! files) there's no exact lossless cut, and the caller re-encodes that
//! piece instead.

use crate::mp3::FrameHeader;

/// The decoder's own delay, in samples.
pub const DECODER_DELAY: u64 = 529;
const MAX_DELAY_FIELD: u64 = 4095;

/// One audio frame of the source.
#[derive(Debug, Clone, Copy)]
pub struct FrameRef {
    pub offset: usize,
    pub len: usize,
    /// Bytes of main data this frame carries (after header, CRC, side info).
    pub main_len: usize,
    /// How far back (bytes) its main data starts.
    pub main_data_begin: usize,
    pub bitrate_kbps: u32,
}

/// The frame layout of an MP3 held in memory.
#[derive(Debug, Clone)]
pub struct Mp3Index {
    pub header: FrameHeader,
    /// Audio frames (the Xing/Info frame excluded).
    pub frames: Vec<FrameRef>,
    /// The Xing/Info frame's bytes, if any.
    pub info_frame: Option<Vec<u8>>,
    /// Encoder delay and padding as stored in the LAME tag (0 without one).
    pub delay_field: u64,
    pub padding_field: u64,
    /// The source had a valid LAME tag (Symphonia trims by it).
    pub gapless: bool,
}

impl Mp3Index {
    pub fn samples_per_frame(&self) -> u64 {
        u64::from(self.header.samples_per_frame())
    }

    /// Start of presentation in the raw decoded stream.
    fn lead(&self) -> u64 {
        if self.gapless {
            DECODER_DELAY + self.delay_field
        } else {
            0
        }
    }

    /// Presentation length in frames (what Symphonia reports).
    pub fn presentation_frames(&self) -> u64 {
        let raw = self.frames.len() as u64 * self.samples_per_frame();
        if self.gapless {
            raw.saturating_sub(self.delay_field + self.padding_field)
        } else {
            raw
        }
    }

    /// All frames share one bitrate.
    pub fn is_cbr(&self) -> bool {
        self.frames
            .windows(2)
            .all(|w| w[0].bitrate_kbps == w[1].bitrate_kbps)
    }

    pub fn bitrate_kbps(&self) -> u32 {
        self.frames
            .first()
            .map_or(self.header.bitrate_kbps, |f| f.bitrate_kbps)
    }

    pub fn parse(data: &[u8]) -> Result<Self, String> {
        let mut pos = id3v2_size(data);
        let mut frames = Vec::new();
        let mut first: Option<FrameHeader> = None;
        let mut info_frame = None;
        let (mut delay_field, mut padding_field, mut gapless) = (0, 0, false);
        while let Some(h) = FrameHeader::parse(&data[pos.min(data.len())..]) {
            if pos + h.length > data.len() {
                break;
            }
            let bytes = &data[pos..pos + h.length];
            if first.is_none() {
                first = Some(h);
                let x = h.xing_offset();
                if bytes.len() >= x + 4
                    && (&bytes[x..x + 4] == b"Xing" || &bytes[x..x + 4] == b"Info")
                {
                    if let Some((d, p)) = lame_delay_padding(bytes, x) {
                        (delay_field, padding_field, gapless) = (d, p, true);
                    }
                    info_frame = Some(bytes.to_vec());
                    pos += h.length;
                    continue;
                }
                if bytes[4..].iter().all(|&b| b == 0) {
                    // LAME's unfilled tag placeholder (an interrupted file).
                    pos += h.length;
                    continue;
                }
            }
            let crc = if bytes[1] & 1 == 0 { 2 } else { 0 };
            let side = h.xing_offset() - 4;
            let mdb = if h.mpeg1 {
                (usize::from(bytes[4 + crc]) << 1) | usize::from(bytes[5 + crc] >> 7)
            } else {
                usize::from(bytes[4 + crc])
            };
            frames.push(FrameRef {
                offset: pos,
                len: h.length,
                main_len: h.length.saturating_sub(4 + crc + side),
                main_data_begin: mdb,
                bitrate_kbps: h.bitrate_kbps,
            });
            pos += h.length;
        }
        let header = first.ok_or("no MP3 frames found")?;
        if frames.is_empty() {
            return Err("the MP3 has no audio frames".into());
        }
        Ok(Self {
            header,
            frames,
            info_frame,
            delay_field,
            padding_field,
            gapless,
        })
    }

    /// A new MP3 holding exactly presentation frames `start..end`, or
    /// `None` if the bit reservoir rules out an exact lossless cut there.
    pub fn cut(&self, data: &[u8], start: u64, end: u64) -> Result<Option<Vec<u8>>, String> {
        let total = self.presentation_frames();
        let end = end.min(total);
        if start >= end {
            return Err("empty range".into());
        }
        let spf = self.samples_per_frame();
        let last = self.frames.len() as u64 - 1;
        let s_a = start + self.lead();
        let s_b = end + self.lead();
        let fs = (s_a / spf).min(last);
        let f0 = self.first_frame_for(fs as usize) as u64;
        // Without a lead-in long enough for the decoder delay, start at 0
        // (only possible at the very start of a tagless file).
        let delay = (s_a - f0 * spf).saturating_sub(DECODER_DELAY);
        if delay > MAX_DELAY_FIELD {
            return Ok(None);
        }
        let f1 = (s_b.div_ceil(spf) - 1).min(last);
        let n = f1 - f0 + 1;
        let padding = (n * spf)
            .saturating_sub(delay + (end - start))
            .min(MAX_DELAY_FIELD);

        let frames = &self.frames[f0 as usize..=f1 as usize];
        let audio_start = frames[0].offset;
        let audio_end = frames[frames.len() - 1].offset + frames[frames.len() - 1].len;
        let audio = &data[audio_start..audio_end];
        let tag = self.tag_frame(frames, audio, delay, padding, !self.is_cbr());
        let mut out = Vec::with_capacity(tag.len() + audio.len());
        out.extend_from_slice(&tag);
        out.extend_from_slice(audio);
        Ok(Some(out))
    }

    /// The earliest frame a piece starting in frame `fs` must include so
    /// that frames `fs - 1` and `fs` have all their main data.
    fn first_frame_for(&self, fs: usize) -> usize {
        let need_from = fs.saturating_sub(1);
        // Main-data stream position where each frame's data starts.
        let mut cum = vec![0usize; fs + 1];
        for j in 0..fs {
            cum[j + 1] = cum[j] + self.frames[j].main_len;
        }
        let needed = (need_from..=fs)
            .map(|j| cum[j].saturating_sub(self.frames[j].main_data_begin))
            .min()
            .unwrap_or(0);
        // The latest frame whose main data starts at or before `needed`.
        (0..=need_from)
            .rev()
            .find(|&j| cum[j] <= needed)
            .unwrap_or(0)
    }

    /// A Xing/Info frame with a LAME tag for `frames`.
    fn tag_frame(
        &self,
        frames: &[FrameRef],
        audio: &[u8],
        delay: u64,
        padding: u64,
        vbr: bool,
    ) -> Vec<u8> {
        let h = self.header;
        let x = h.xing_offset();
        // Header + side info + Xing (120) + LAME (36).
        let needed = x + 120 + 36;
        let mut frame = match &self.info_frame {
            Some(f) if f.len() >= needed => vec![0u8; f.len()],
            _ => Vec::new(),
        };
        let header_bytes: [u8; 4] = match &self.info_frame {
            Some(f) if f.len() >= needed => [f[0], f[1] | 1, f[2], f[3]],
            _ => {
                // A frame of the source's format, at the lowest bitrate that
                // holds the tag.
                let first = self.frames[0];
                let b = &audio[..4];
                let mut hb = [b[0], b[1] | 1, b[2] & 0x0D, b[3]];
                let mut chosen = None;
                for idx in 1u8..15 {
                    hb[2] = (b[2] & 0x0D) | (idx << 4);
                    if let Some(fh) = FrameHeader::parse(&hb)
                        && fh.length >= needed
                    {
                        chosen = Some(fh.length);
                        break;
                    }
                }
                frame = vec![0u8; chosen.unwrap_or(first.len.max(needed))];
                hb
            }
        };
        frame[..4].copy_from_slice(&header_bytes);
        let total_bytes = (frame.len() + audio.len()) as u32;
        let mut w = x;
        frame[w..w + 4].copy_from_slice(if vbr { b"Xing" } else { b"Info" });
        frame[w + 4..w + 8].copy_from_slice(&0x0Fu32.to_be_bytes());
        frame[w + 8..w + 12].copy_from_slice(&(frames.len() as u32).to_be_bytes());
        frame[w + 12..w + 16].copy_from_slice(&total_bytes.to_be_bytes());
        // Seek table: byte position (in 256ths of the file) at each percent.
        let base = frames[0].offset;
        for i in 0..100 {
            let f = &frames[(i * frames.len() / 100).min(frames.len() - 1)];
            let pos = frame.len() + (f.offset - base);
            frame[w + 16 + i] = ((pos as u64 * 256) / u64::from(total_bytes)).min(255) as u8;
        }
        // Quality: copied from the source's tag, else LAME's default.
        let quality = self
            .info_frame
            .as_ref()
            .filter(|f| f.len() >= needed)
            .map(|f| [f[w + 116], f[w + 117], f[w + 118], f[w + 119]])
            .unwrap_or(57u32.to_be_bytes());
        frame[w + 116..w + 120].copy_from_slice(&quality);
        w += 120;
        // LAME extension: encoder string, revision/VBR method and lowpass
        // from the source when it has them; ReplayGain cleared (it described
        // the whole recording).
        match self
            .info_frame
            .as_ref()
            .filter(|f| f.len() >= needed && &f[w..w + 4] == b"LAME")
        {
            Some(src) => {
                frame[w..w + 11].copy_from_slice(&src[w..w + 11]);
                frame[w + 19..w + 21].copy_from_slice(&src[w + 19..w + 21]); // flags/ATH, bitrate
                frame[w + 24..w + 28].copy_from_slice(&src[w + 24..w + 28]); // misc, gain, preset
            }
            None => frame[w..w + 9].copy_from_slice(b"LAME3.100"),
        }
        let trim = ((delay.min(MAX_DELAY_FIELD) as u32) << 12) | padding as u32;
        frame[w + 21..w + 24].copy_from_slice(&trim.to_be_bytes()[1..]);
        frame[w + 28..w + 32].copy_from_slice(&total_bytes.to_be_bytes());
        frame[w + 32..w + 34].copy_from_slice(&crc16(0, audio).to_be_bytes());
        let tag_crc = crc16(0, &frame[..w + 34]);
        frame[w + 34..w + 36].copy_from_slice(&tag_crc.to_be_bytes());
        frame
    }
}

/// CRC-16/ARC, as the LAME tag uses.
pub fn crc16(mut crc: u16, data: &[u8]) -> u16 {
    for &b in data {
        crc ^= u16::from(b);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xA001
            } else {
                crc >> 1
            };
        }
    }
    crc
}

/// (delay, padding) from a LAME tag whose CRC checks out.
fn lame_delay_padding(frame: &[u8], xing: usize) -> Option<(u64, u64)> {
    let flags = u32::from_be_bytes(frame.get(xing + 4..xing + 8)?.try_into().ok()?);
    let mut w = xing + 8;
    for (bit, len) in [(1, 4), (2, 4), (4, 100), (8, 4)] {
        if flags & bit != 0 {
            w += len;
        }
    }
    let lame = frame.get(w..w + 36)?;
    if &lame[..4] != b"LAME" && &lame[..4] != b"Lavf" && &lame[..4] != b"Lavc" {
        return None;
    }
    let stored = u16::from_be_bytes([lame[34], lame[35]]);
    if crc16(0, &frame[..w + 34]) != stored {
        return None;
    }
    let trim = (u32::from(lame[21]) << 16) | (u32::from(lame[22]) << 8) | u32::from(lame[23]);
    Some((u64::from(trim >> 12), u64::from(trim & 0xFFF)))
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{mp3::tests::encode_all, paths::tempdir, player::Source, settings::Quality};

    /// A non-repeating test signal (so misaligned samples can't match).
    fn chirp(seconds: f64, rate: u32) -> Vec<f32> {
        let frames = (seconds * f64::from(rate)) as usize;
        (0..frames)
            .flat_map(|i| {
                let t = i as f32 / rate as f32;
                let l = (t * (200.0 + 300.0 * t) * std::f32::consts::TAU).sin() * 0.4;
                let r = (t * (700.0 - 100.0 * t) * std::f32::consts::TAU).sin() * 0.3;
                [l, r]
            })
            .collect()
    }

    fn decode(path: &std::path::Path) -> (Vec<f32>, Option<u64>) {
        let mut s = Source::open(path).unwrap();
        let mut out = Vec::new();
        while s.decode(&mut out) {}
        (out, s.n_frames)
    }

    fn encode(seconds: f64, rate: u32, quality: Quality) -> Vec<u8> {
        if quality == Quality::Cbr192 {
            return encode_all(&chirp(seconds, rate), rate, true);
        }
        let mut enc = crate::mp3::Mp3Encoder::new(rate, quality).unwrap();
        let mut out = enc.encode(&chirp(seconds, rate)).unwrap().to_vec();
        out.extend_from_slice(enc.flush().unwrap());
        let tag = enc.lame_tag().unwrap();
        out[..tag.len()].copy_from_slice(&tag);
        out
    }

    fn check_cuts(quality: Quality, rate: u32) {
        let dir = tempdir();
        let data = encode(4.0, rate, quality);
        let src = dir.join("src.mp3");
        std::fs::write(&src, &data).unwrap();
        let (whole, n) = decode(&src);
        let index = Mp3Index::parse(&data).unwrap();
        assert!(index.gapless);
        assert_eq!(
            Some(index.presentation_frames()),
            n,
            "our length matches Symphonia's"
        );
        let total = index.presentation_frames();
        let mut skipped = 0;
        for (a, b) in [
            (0, 10_000),
            (12_345, 100_001),
            (rate as u64, 2 * rate as u64 + 77),
            (150_000, total),
        ] {
            let Some(piece) = index.cut(&data, a, b).unwrap() else {
                assert_eq!(quality, Quality::Vbr2, "CBR cuts are always lossless");
                skipped += 1;
                continue;
            };
            let path = dir.join(format!("piece-{a}.mp3"));
            std::fs::write(&path, &piece).unwrap();
            let (got, got_n) = decode(&path);
            assert_eq!(got_n, Some(b - a), "length of {a}..{b}");
            let want = &whole[a as usize * 2..b as usize * 2];
            assert_eq!(got.len(), want.len(), "decoded length of {a}..{b}");
            let worst = got
                .iter()
                .zip(want)
                .map(|(x, y)| (x - y).abs())
                .fold(0.0, f32::max);
            if worst >= 1e-4 {
                let first = got
                    .iter()
                    .zip(want)
                    .position(|(x, y)| (x - y).abs() > 1e-4)
                    .unwrap();
                let last = got
                    .iter()
                    .zip(want)
                    .rposition(|(x, y)| (x - y).abs() > 1e-4)
                    .unwrap();
                eprintln!(
                    "{a}..{b}: mismatch frames {}..{} of {}",
                    first / 2,
                    last / 2,
                    got.len() / 2
                );
            }
            assert!(worst < 1e-4, "{a}..{b} differs by up to {worst}");
            // The piece re-parses with its own tag.
            let re = Mp3Index::parse(&piece).unwrap();
            assert!(re.gapless);
            assert_eq!(re.presentation_frames(), b - a);
        }
        assert!(skipped < 4, "some cuts are lossless");
    }

    #[test]
    fn cuts_are_sample_exact_cbr_48k() {
        check_cuts(Quality::Cbr192, 48000);
    }

    #[test]
    fn cuts_are_sample_exact_cbr_44k_low_bitrate() {
        check_cuts(Quality::Cbr128, 44100);
    }

    #[test]
    fn cuts_are_sample_exact_vbr() {
        check_cuts(Quality::Vbr2, 48000);
    }

    #[test]
    fn crc_matches_the_reference() {
        assert_eq!(crc16(0, b"123456789"), 0xBB3D); // CRC-16/ARC check value
    }
}

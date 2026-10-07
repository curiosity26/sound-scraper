//! Audio CDs (docs/playlists-and-cd-burning-design.md §4, §7): the Red Book
//! layout of a playlist, the prepared CD audio, `.cue`/`.bin` images, and the
//! burners that write a prepared disc somewhere (an image, a simulated
//! recorder, and later the OS burning APIs).

use std::{
    fs::File,
    io::{self, Read},
    path::PathBuf,
    sync::atomic::AtomicBool,
};

use serde::{Deserialize, Serialize};

pub mod cue;
pub mod image;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod sim;
#[cfg(target_os = "windows")]
pub mod windows;

/// One sector of CD audio: 588 stereo frames of 16-bit little-endian PCM.
pub const SECTOR_BYTES: usize = 2352;
pub const FRAMES_PER_SECTOR: u64 = 588;
pub const SECTORS_PER_SECOND: u64 = 75;
pub const SAMPLE_RATE: u32 = 44_100;
pub const MAX_TRACKS: usize = 99;
/// Tracks shorter than 4 s are padded with silence to this.
pub const MIN_TRACK_SECTORS: u64 = 4 * SECTORS_PER_SECOND;
/// Track 1's pregap, always written by the drive before the program.
pub const FIRST_PREGAP_SECTORS: u64 = 2 * SECTORS_PER_SECOND;
/// 74:00.
pub const SECTORS_74: u64 = 74 * 60 * SECTORS_PER_SECOND;
/// 79:57, what real 80-minute blanks report.
pub const SECTORS_80: u64 = (79 * 60 + 57) * SECTORS_PER_SECOND;

/// A track to put on the disc.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub title: String,
    pub performer: Option<String>,
    /// Audio length in 44.1 kHz stereo frames (before padding).
    pub frames: u64,
}

/// Where a track sits on the disc. Sectors count from the start of the
/// program after track 1's pregap (the `.bin` file's first sector).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLayout {
    pub number: u32,
    /// Silence before the track (in the program; 0 for track 1, whose
    /// pregap the drive writes).
    pub gap: u64,
    /// First sector of the gap (INDEX 00), or of the track when no gap.
    pub gap_start: u64,
    /// First sector of the audio (INDEX 01).
    pub start: u64,
    /// Audio sectors, padded to whole sectors and at least 4 s.
    pub sectors: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub tracks: Vec<TrackLayout>,
    /// Sectors in the program (the `.bin`), gaps included.
    pub program_sectors: u64,
    /// Everything the disc needs: track 1's pregap plus the program.
    pub disc_sectors: u64,
}

/// Lays tracks out with `gap_seconds` of silence between them.
pub fn layout(tracks: &[TrackInfo], gap_seconds: u32) -> Result<Layout, String> {
    if tracks.is_empty() {
        return Err("There's nothing to burn.".into());
    }
    if tracks.len() > MAX_TRACKS {
        return Err(format!(
            "A CD holds at most {MAX_TRACKS} tracks; this has {}.",
            tracks.len()
        ));
    }
    let gap = u64::from(gap_seconds) * SECTORS_PER_SECOND;
    let mut at = 0;
    let mut out = Vec::with_capacity(tracks.len());
    for (i, t) in tracks.iter().enumerate() {
        let gap = if i == 0 { 0 } else { gap };
        let sectors = t.frames.div_ceil(FRAMES_PER_SECTOR).max(MIN_TRACK_SECTORS);
        out.push(TrackLayout {
            number: i as u32 + 1,
            gap,
            gap_start: at,
            start: at + gap,
            sectors,
        });
        at += gap + sectors;
    }
    Ok(Layout {
        tracks: out,
        program_sectors: at,
        disc_sectors: FIRST_PREGAP_SECTORS + at,
    })
}

impl Layout {
    /// Fails, saying by how much, when the disc needs more than `capacity`.
    pub fn check_fits(&self, capacity: u64) -> Result<(), String> {
        if self.disc_sectors <= capacity {
            return Ok(());
        }
        Err(format!(
            "This needs {} but the disc holds {}: {} too long.",
            msf_time(self.disc_sectors),
            msf_time(capacity),
            msf_time(self.disc_sectors - capacity)
        ))
    }

    /// Which track a program sector belongs to (its gap counts as its own),
    /// and how far through that track's audio it is (0..1).
    pub fn locate(&self, sector: u64) -> (usize, f64) {
        let i = self
            .tracks
            .iter()
            .rposition(|t| t.gap_start <= sector)
            .unwrap_or(0);
        let t = &self.tracks[i];
        let into = sector.saturating_sub(t.start) as f64 / t.sectors.max(1) as f64;
        (i, into.clamp(0.0, 1.0))
    }
}

/// `mm:ss` for a sector count.
pub fn msf_time(sectors: u64) -> String {
    let seconds = sectors.div_ceil(SECTORS_PER_SECOND);
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

/// `mm:ss:ff` (frames are 1/75 s), as cue sheets write positions.
pub fn msf(sectors: u64) -> String {
    let ff = sectors % SECTORS_PER_SECOND;
    let s = sectors / SECTORS_PER_SECOND;
    format!("{:02}:{:02}:{:02}", s / 60, s % 60, ff)
}

/// A playlist ready to write: its layout and each track's CD audio, one
/// raw file per track (16-bit LE stereo, already padded to `sectors`).
#[derive(Debug, Clone)]
pub struct PreparedDisc {
    /// The album title for CD-Text (the playlist's name).
    pub title: String,
    pub performer: Option<String>,
    pub tracks: Vec<TrackInfo>,
    pub files: Vec<PathBuf>,
    pub layout: Layout,
}

impl PreparedDisc {
    /// Reads the whole program (gaps and tracks) in order, a chunk at a time;
    /// `sink` gets each chunk and the program sector reached. Stops early if
    /// `sink` fails.
    pub fn stream(
        &self,
        mut sink: impl FnMut(&[u8], u64) -> Result<(), String>,
    ) -> Result<(), String> {
        const CHUNK_SECTORS: usize = 75;
        let silence = vec![0u8; SECTOR_BYTES * CHUNK_SECTORS];
        let mut at = 0u64;
        for (t, path) in self.layout.tracks.iter().zip(&self.files) {
            let mut gap = t.gap;
            while gap > 0 {
                let n = gap.min(CHUNK_SECTORS as u64);
                at += n;
                sink(&silence[..n as usize * SECTOR_BYTES], at)?;
                gap -= n;
            }
            let mut file =
                File::open(path).map_err(|e| format!("reading {}: {e}", path.display()))?;
            let mut left = t.sectors;
            let mut buf = vec![0u8; SECTOR_BYTES * CHUNK_SECTORS];
            while left > 0 {
                let n = left.min(CHUNK_SECTORS as u64) as usize;
                let bytes = &mut buf[..n * SECTOR_BYTES];
                read_full(&mut file, bytes)
                    .map_err(|e| format!("reading {}: {e}", path.display()))?;
                at += n as u64;
                sink(bytes, at)?;
                left -= n as u64;
            }
        }
        Ok(())
    }
}

/// Fills `buf`, padding with silence if the file is short.
fn read_full(file: &mut File, buf: &mut [u8]) -> io::Result<()> {
    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    buf[filled..].fill(0);
    Ok(())
}

// ------------------------------------------------------------ burners

/// What a destination can do and what's in it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// "image", "sim", or the OS's id for a drive.
    pub id: String,
    pub name: String,
    /// "image" | "simulated" | "drive"
    pub kind: String,
    pub media: Media,
    /// Write speeds (x) the drive offers for this disc; empty = automatic.
    pub speeds: Vec<u32>,
    /// Can burn with the laser off (a test write).
    pub can_test: bool,
    /// Can write without gaps (Disc-at-Once).
    pub gapless: bool,
    pub cd_text: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    /// "none" | "blank" | "erasable" (a CD-RW with something on it) |
    /// "unusable" | "image"
    pub state: String,
    /// "CD-R", "CD-RW", "DVD-R"…, when there's a disc.
    pub kind: Option<String>,
    /// Sectors free for audio (with a disc, or nominal for an image).
    pub capacity: Option<u64>,
    /// Plain words for the device list ("CD-R 80 min, blank").
    pub label: String,
}

/// How to write.
#[derive(Debug, Clone, Default)]
pub struct WriteOptions {
    /// Where an image goes (`.cue`; the `.bin` sits beside it).
    pub image_path: Option<PathBuf>,
    /// x; 0 = the fastest.
    pub speed: u32,
    pub test_write: bool,
    pub cd_text: bool,
    pub eject: bool,
    /// Erase a CD-RW that has something on it first.
    pub erase: bool,
}

/// The CD writers attached now (macOS and Windows; none elsewhere yet).
pub fn drives() -> Vec<Device> {
    #[cfg(target_os = "macos")]
    return macos::devices();
    #[cfg(target_os = "windows")]
    return windows::devices();
    #[allow(unreachable_code)]
    Vec::new()
}

/// The OS burner for a drive from `drives()`.
pub fn drive_burner(id: &str) -> Option<Box<dyn Burner>> {
    #[cfg(target_os = "macos")]
    return Some(Box::new(macos::DiscRecordingBurner { device_id: id.to_string() }));
    #[cfg(target_os = "windows")]
    return Some(Box::new(windows::ImapiBurner { device_id: id.to_string() }));
    #[allow(unreachable_code)]
    {
        let _ = id;
        None
    }
}

/// What a burner reports while writing.
#[derive(Debug, Clone, PartialEq)]
pub enum BurnEvent {
    /// A step without a track: "Writing lead-in", "Closing the disc"…
    Phase(String),
    /// Program sectors written so far, and the drive's speed and buffer
    /// when it says.
    Written {
        sectors: u64,
        speed_x: Option<f64>,
        buffer: Option<f64>,
    },
    /// A line for the burn log.
    Log(String),
}

pub trait Burner: Send + Sync {
    fn write(
        &self,
        disc: &PreparedDisc,
        options: &WriteOptions,
        events: &(dyn Fn(BurnEvent) + Sync),
        cancel: &AtomicBool,
    ) -> Result<String, String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(seconds: f64) -> TrackInfo {
        TrackInfo {
            title: "t".into(),
            performer: None,
            frames: (seconds * 44_100.0).round() as u64,
        }
    }

    #[test]
    fn lays_out_gaps_padding_and_minimum_length() {
        let l = layout(&[track(10.0), track(1.0), track(10.01)], 2).unwrap();
        assert_eq!(
            l.tracks[0],
            TrackLayout {
                number: 1,
                gap: 0,
                gap_start: 0,
                start: 0,
                sectors: 750
            }
        );
        assert_eq!(
            l.tracks[1],
            TrackLayout {
                number: 2,
                gap: 150,
                gap_start: 750,
                start: 900,
                sectors: 300
            }
        );
        assert_eq!(l.tracks[2].start, 900 + 300 + 150);
        assert_eq!(l.tracks[2].sectors, 751, "a partial sector rounds up");
        assert_eq!(l.program_sectors, 750 + 150 + 300 + 150 + 751);
        assert_eq!(l.disc_sectors, l.program_sectors + 150);
        let gapless = layout(&[track(10.0), track(10.0)], 0).unwrap();
        assert_eq!(gapless.tracks[1].start, 750);
    }

    #[test]
    fn limits_and_capacity() {
        assert!(layout(&[], 2).is_err());
        assert!(layout(&vec![track(5.0); 100], 2).is_err());
        assert!(layout(&vec![track(5.0); 99], 2).is_ok());
        let full = layout(&[track(74.0 * 60.0 - 2.0)], 2).unwrap();
        assert_eq!(full.disc_sectors, SECTORS_74);
        assert!(full.check_fits(SECTORS_74).is_ok());
        let over = layout(&[track(74.0 * 60.0 + 10.0)], 2).unwrap();
        let e = over.check_fits(SECTORS_74).unwrap_err();
        assert!(e.contains("0:12 too long"), "{e}");
    }

    #[test]
    fn locates_sectors_in_tracks_and_gaps() {
        let l = layout(&[track(10.0), track(10.0)], 2).unwrap();
        assert_eq!(l.locate(0), (0, 0.0));
        assert_eq!(l.locate(375), (0, 0.5));
        assert_eq!(l.locate(760), (1, 0.0), "in track 2's gap");
        assert_eq!(l.locate(900 + 375), (1, 0.5));
        assert_eq!(msf(150), "00:02:00");
        assert_eq!(msf(75 * 61 + 3), "01:01:03");
    }
}

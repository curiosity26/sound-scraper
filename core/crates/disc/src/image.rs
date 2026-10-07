//! The image "burner": writes the program as `<name>.bin` beside
//! `<name>.cue`.

use std::{
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{
    BurnEvent, Burner, Device, Media, PreparedDisc, SECTORS_80, WriteOptions, cue::cue_sheet,
};

pub struct ImageBurner;

pub fn device() -> Device {
    Device {
        id: "image".into(),
        name: "Disc image (.cue/.bin)".into(),
        kind: "image".into(),
        media: Media {
            state: "image".into(),
            kind: None,
            capacity: Some(SECTORS_80),
            label: "Burn it later with ImgBurn, CDBurnerXP, cdrdao or Brasero".into(),
        },
        speeds: Vec::new(),
        can_test: false,
        gapless: true,
        cd_text: true,
    }
}

/// `<stem>.bin` beside the cue sheet.
pub fn bin_path(cue: &Path) -> PathBuf {
    cue.with_extension("bin")
}

/// Writes `disc` as a cue/bin pair at `cue` (via `.part` files, renamed
/// when complete). Reports program sectors written.
pub fn write_image(
    disc: &PreparedDisc,
    cue: &Path,
    cd_text: bool,
    events: &(dyn Fn(BurnEvent) + Sync),
    cancel: &AtomicBool,
) -> Result<(), String> {
    let bin = bin_path(cue);
    let bin_part = bin.with_extension("bin.part");
    let result = (|| {
        let file =
            File::create(&bin_part).map_err(|e| format!("creating {}: {e}", bin.display()))?;
        let mut out = BufWriter::with_capacity(1 << 20, file);
        let mut last = 0;
        disc.stream(|bytes, sector| {
            if cancel.load(Ordering::Relaxed) {
                return Err("Cancelled.".into());
            }
            out.write_all(bytes)
                .map_err(|e| format!("writing {}: {e}", bin.display()))?;
            if sector - last >= 75 || sector == disc.layout.program_sectors {
                last = sector;
                events(BurnEvent::Written {
                    sectors: sector,
                    speed_x: None,
                    buffer: None,
                });
            }
            Ok(())
        })?;
        out.flush()
            .map_err(|e| format!("writing {}: {e}", bin.display()))?;
        let name = bin
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let sheet = cue_sheet(
            &name,
            &disc.title,
            disc.performer.as_deref(),
            &disc.tracks,
            &disc.layout,
            cd_text,
        );
        std::fs::write(cue, sheet).map_err(|e| format!("writing {}: {e}", cue.display()))?;
        std::fs::rename(&bin_part, &bin).map_err(|e| format!("writing {}: {e}", bin.display()))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&bin_part);
    }
    result
}

impl Burner for ImageBurner {
    fn write(
        &self,
        disc: &PreparedDisc,
        options: &WriteOptions,
        events: &(dyn Fn(BurnEvent) + Sync),
        cancel: &AtomicBool,
    ) -> Result<String, String> {
        let cue = options
            .image_path
            .clone()
            .ok_or("Choose where to save the image.")?;
        let cue = if cue
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("cue"))
        {
            cue
        } else {
            cue.with_extension("cue")
        };
        events(BurnEvent::Phase("Writing the image".into()));
        write_image(disc, &cue, options.cd_text, events, cancel)?;
        events(BurnEvent::Log(format!(
            "Saved {} and {}",
            file_name(&cue),
            file_name(&bin_path(&cue))
        )));
        Ok(cue.to_string_lossy().into_owned())
    }
}

fn file_name(p: &Path) -> String {
    p.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
pub(crate) mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::{TrackInfo, layout};

    /// A prepared disc of tracks whose samples count up (so order can be checked).
    pub(crate) fn sample_disc(dir: &Path, seconds: &[f64]) -> PreparedDisc {
        std::fs::create_dir_all(dir).unwrap();
        let tracks: Vec<TrackInfo> = seconds
            .iter()
            .enumerate()
            .map(|(i, s)| TrackInfo {
                title: format!("T{}", i + 1),
                performer: None,
                frames: (s * 44_100.0) as u64,
            })
            .collect();
        let l = layout(&tracks, 2).unwrap();
        let files = l
            .tracks
            .iter()
            .enumerate()
            .map(|(i, t)| {
                let path = dir.join(format!("{i}.pcm"));
                let bytes: Vec<u8> = (0..t.sectors as usize * crate::SECTOR_BYTES / 2)
                    .flat_map(|n| (((i + 1) * 1000 + n % 7) as i16).to_le_bytes())
                    .collect();
                std::fs::write(&path, bytes).unwrap();
                path
            })
            .collect();
        PreparedDisc {
            title: "Mix".into(),
            performer: None,
            tracks,
            files,
            layout: l,
        }
    }

    pub(crate) fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-disc-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_bin_with_gaps_and_cue() {
        let dir = temp("image");
        let disc = sample_disc(&dir.join("pcm"), &[5.0, 4.0]);
        let seen = Mutex::new(Vec::new());
        let cue = dir.join("Mix.cue");
        write_image(
            &disc,
            &cue,
            true,
            &|e| seen.lock().unwrap().push(e),
            &AtomicBool::new(false),
        )
        .unwrap();
        let bin = std::fs::read(dir.join("Mix.bin")).unwrap();
        assert_eq!(
            bin.len() as u64,
            disc.layout.program_sectors * crate::SECTOR_BYTES as u64
        );
        // Track 1, then 150 sectors of silence, then track 2.
        let s = crate::SECTOR_BYTES;
        assert_eq!(i16::from_le_bytes([bin[0], bin[1]]), 1000);
        let gap = 375 * s;
        assert!(bin[gap..gap + 150 * s].iter().all(|b| *b == 0));
        let t2 = gap + 150 * s;
        assert_eq!(i16::from_le_bytes([bin[t2], bin[t2 + 1]]), 2000);
        let sheet = std::fs::read_to_string(&cue).unwrap();
        assert!(
            sheet.contains("FILE \"Mix.bin\" BINARY") && sheet.contains("INDEX 01 00:07:00"),
            "{sheet}"
        );
        let last = seen.lock().unwrap().last().cloned().unwrap();
        assert_eq!(
            last,
            BurnEvent::Written {
                sectors: disc.layout.program_sectors,
                speed_x: None,
                buffer: None
            }
        );
    }

    #[test]
    fn cancelling_leaves_nothing() {
        let dir = temp("cancel");
        let disc = sample_disc(&dir.join("pcm"), &[5.0]);
        let cue = dir.join("Mix.cue");
        assert!(write_image(&disc, &cue, true, &|_| {}, &AtomicBool::new(true)).is_err());
        assert!(
            !cue.exists() && !dir.join("Mix.bin").exists() && !dir.join("Mix.bin.part").exists()
        );
    }
}

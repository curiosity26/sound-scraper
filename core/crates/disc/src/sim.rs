//! A simulated CD recorder (design §9.2): behaves like a drive, in real
//! time or fast, with a pretend disc and injectable faults, so the whole
//! burn flow and its progress panel can be tried without a burner. What it
//! "burns" is kept as a cue/bin in its folder, so the bytes a drive would
//! have received can be checked.

use std::{
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::sleep,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use crate::{
    BurnEvent, Burner, Device, Media, PreparedDisc, SECTOR_BYTES, SECTORS_74, SECTORS_80,
    SECTORS_PER_SECOND, WriteOptions, image::write_image, msf_time,
};

/// The pretend disc in the simulated drive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SimMedia {
    Blank74,
    Blank80,
    /// A CD-RW with data on it: needs erasing.
    RewritableUsed,
    None,
    Dvd,
}

/// Something to go wrong, for trying the failure paths.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SimFault {
    None,
    /// The drive ran out of data while writing this track (1-based).
    Underrun {
        track: u32,
    },
    /// The disc was ejected while writing this track.
    Removed {
        track: u32,
    },
    /// The drive reported a write error in this track.
    WriteError {
        track: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimSettings {
    pub media: SimMedia,
    pub fault: SimFault,
    /// Eight times faster than a real drive at the chosen speed.
    pub fast: bool,
}

impl Default for SimSettings {
    fn default() -> Self {
        Self {
            media: SimMedia::Blank80,
            fault: SimFault::None,
            fast: false,
        }
    }
}

static SETTINGS: Mutex<SimSettings> = Mutex::new(SimSettings {
    media: SimMedia::Blank80,
    fault: SimFault::None,
    fast: false,
});

pub fn settings() -> SimSettings {
    *SETTINGS.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn set_settings(s: SimSettings) {
    *SETTINGS.lock().unwrap_or_else(|e| e.into_inner()) = s;
}

const SPEEDS: [u32; 5] = [4, 8, 16, 24, 48];
const DEFAULT_SPEED: u32 = 24;

pub fn device() -> Device {
    let s = settings();
    let (state, kind, capacity, label) = match s.media {
        SimMedia::Blank74 => (
            "blank",
            Some("CD-R"),
            Some(SECTORS_74),
            "CD-R 74 min, blank",
        ),
        SimMedia::Blank80 => (
            "blank",
            Some("CD-R"),
            Some(SECTORS_80),
            "CD-R 80 min, blank",
        ),
        SimMedia::RewritableUsed => (
            "erasable",
            Some("CD-RW"),
            Some(SECTORS_80),
            "CD-RW, not blank (erase first)",
        ),
        SimMedia::None => ("none", None, None, "no disc"),
        SimMedia::Dvd => (
            "unusable",
            Some("DVD-R"),
            None,
            "DVD-R: audio CDs need a CD-R or CD-RW",
        ),
    };
    Device {
        id: "sim".into(),
        name: "Simulated CD Recorder".into(),
        kind: "simulated".into(),
        media: Media {
            state: state.into(),
            kind: kind.map(str::to_string),
            capacity,
            label: label.into(),
        },
        speeds: SPEEDS.to_vec(),
        can_test: true,
        gapless: true,
        cd_text: true,
    }
}

pub struct SimBurner {
    /// Where the last simulated burn is kept (`burned.cue`/`.bin`).
    pub dir: PathBuf,
}

impl SimBurner {
    /// Sleeps `secs` of drive time (scaled when fast) in small steps;
    /// false if cancelled meanwhile.
    fn wait(&self, secs: f64, fast: bool, cancel: &AtomicBool) -> bool {
        let end = Instant::now() + Duration::from_secs_f64(if fast { secs / 8.0 } else { secs });
        while Instant::now() < end {
            if cancel.load(Ordering::Relaxed) {
                return false;
            }
            sleep(Duration::from_millis(20));
        }
        !cancel.load(Ordering::Relaxed)
    }
}

impl Burner for SimBurner {
    fn write(
        &self,
        disc: &PreparedDisc,
        options: &WriteOptions,
        events: &(dyn Fn(BurnEvent) + Sync),
        cancel: &AtomicBool,
    ) -> Result<String, String> {
        let s = settings();
        let device = device();
        match s.media {
            SimMedia::None => return Err("There's no disc in the drive.".into()),
            SimMedia::Dvd => return Err("That's a DVD. Audio CDs need a CD-R or CD-RW.".into()),
            SimMedia::RewritableUsed if !options.erase => {
                return Err(
                    "The CD-RW isn't blank. Choose Erase and Burn to erase it first.".into(),
                );
            }
            _ => {}
        }
        disc.layout
            .check_fits(device.media.capacity.unwrap_or(SECTORS_80))?;
        let speed = if options.speed == 0 {
            DEFAULT_SPEED
        } else {
            options.speed
        };
        let test = if options.test_write {
            " (test write, laser off)"
        } else {
            ""
        };
        let cancelled = || Err::<String, String>("Cancelled.".into());

        if s.media == SimMedia::RewritableUsed {
            events(BurnEvent::Phase("Erasing the CD-RW".into()));
            events(BurnEvent::Log("Quick-erasing the CD-RW".into()));
            if !self.wait(4.0, s.fast, cancel) {
                return cancelled();
            }
        }
        events(BurnEvent::Log(format!(
            "Burn started at {speed}x ({} KB/s), Disc-at-Once, CD-Text {}{test}",
            speed as usize * SECTORS_PER_SECOND as usize * SECTOR_BYTES / 1000,
            if options.cd_text { "on" } else { "off" }
        )));
        events(BurnEvent::Phase("Writing lead-in".into()));
        if !self.wait(3.0, s.fast, cancel) {
            return cancelled();
        }

        // The program, paced like a drive at `speed`.
        std::fs::create_dir_all(&self.dir)
            .map_err(|e| format!("creating {}: {e}", self.dir.display()))?;
        let cue = self.dir.join("burned.cue");
        let start = Instant::now();
        let per_sector =
            1.0 / (f64::from(speed) * SECTORS_PER_SECOND as f64) / if s.fast { 8.0 } else { 1.0 };
        let wobble = std::sync::atomic::AtomicU64::new(1);
        let fault_track = match s.fault {
            SimFault::None => None,
            SimFault::Underrun { track }
            | SimFault::Removed { track }
            | SimFault::WriteError { track } => Some(track),
        };
        let failed_at = Mutex::new(None);
        let result = write_image(
            disc,
            &cue,
            options.cd_text,
            &|e| {
                let BurnEvent::Written { sectors, .. } = e else {
                    return;
                };
                let (track, fraction) = disc.layout.locate(sectors);
                if fault_track == Some(track as u32 + 1) && fraction >= 0.4 {
                    // Stop write_image; the failure is reported below.
                    *failed_at.lock().unwrap() = Some(sectors);
                    cancel.store(true, Ordering::Relaxed);
                    return;
                }
                let due = Duration::from_secs_f64(sectors as f64 * per_sector);
                while start.elapsed() < due && !cancel.load(Ordering::Relaxed) {
                    sleep(Duration::from_millis(15));
                }
                let w = wobble
                    .load(Ordering::Relaxed)
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                wobble.store(w, Ordering::Relaxed);
                let buffer = 0.9 + (w >> 59) as f64 / 320.0;
                events(BurnEvent::Written {
                    sectors,
                    speed_x: Some(f64::from(speed)),
                    buffer: Some(buffer),
                });
            },
            cancel,
        );
        if let Some(at) = *failed_at.lock().unwrap() {
            cancel.store(false, Ordering::Relaxed);
            let place = msf_time(at);
            return Err(match s.fault {
                SimFault::Underrun { .. } => format!(
                    "Buffer underrun at {place}: the drive ran out of data. With underrun protection off, this disc can't be used."
                ),
                SimFault::Removed { .. } => format!("The disc was removed at {place}."),
                _ => format!(
                    "The drive reported a write error at {place} (medium error). Try another disc or a slower speed."
                ),
            });
        }
        if result.is_err() && cancel.load(Ordering::Relaxed) {
            return cancelled();
        }
        result?;

        events(BurnEvent::Phase("Writing lead-out".into()));
        if !self.wait(2.0, s.fast, cancel) {
            return cancelled();
        }
        events(BurnEvent::Phase("Closing the disc".into()));
        if !self.wait(2.0, s.fast, cancel) {
            return cancelled();
        }
        if options.test_write {
            events(BurnEvent::Log(
                "Test write finished: nothing was written to the disc".into(),
            ));
        } else if options.eject {
            events(BurnEvent::Log("Ejected the disc".into()));
        }
        Ok(cue.to_string_lossy().into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image::tests::{sample_disc, temp};

    fn burn(
        settings: SimSettings,
        options: WriteOptions,
    ) -> (Result<String, String>, Vec<BurnEvent>, PathBuf) {
        let dir = temp(
            &format!("sim-{:?}-{:?}", settings.media, settings.fault)
                .replace(['{', '}', ' ', ':'], ""),
        );
        let disc = sample_disc(&dir.join("pcm"), &[4.0, 4.0]);
        set_settings(settings);
        let seen = Mutex::new(Vec::new());
        let r = SimBurner {
            dir: dir.join("out"),
        }
        .write(
            &disc,
            &options,
            &|e| seen.lock().unwrap().push(e),
            &AtomicBool::new(false),
        );
        (r, seen.into_inner().unwrap(), dir)
    }

    // One test, since the settings are global.
    #[test]
    fn burns_fails_and_checks_the_disc() {
        let fast = |media, fault| SimSettings {
            media,
            fault,
            fast: true,
        };
        let opts = WriteOptions {
            speed: 48,
            cd_text: true,
            ..Default::default()
        };

        let (r, events, dir) = burn(fast(SimMedia::Blank80, SimFault::None), opts.clone());
        let cue = r.unwrap();
        assert!(
            std::fs::read_to_string(&cue)
                .unwrap()
                .contains("TRACK 02 AUDIO")
        );
        assert!(dir.join("out/burned.bin").exists());
        let phases: Vec<_> = events
            .iter()
            .filter_map(|e| {
                if let BurnEvent::Phase(p) = e {
                    Some(p.as_str())
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(
            phases,
            ["Writing lead-in", "Writing lead-out", "Closing the disc"]
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, BurnEvent::Written { speed_x: Some(s), .. } if *s == 48.0))
        );

        let (r, events, _) = burn(
            fast(SimMedia::Blank80, SimFault::Underrun { track: 2 }),
            opts.clone(),
        );
        assert!(r.unwrap_err().starts_with("Buffer underrun"));
        let last = events.iter().rev().find_map(|e| {
            if let BurnEvent::Written { sectors, .. } = e {
                Some(*sectors)
            } else {
                None
            }
        });
        assert!(last.unwrap() > 300, "got into track 2");

        assert!(
            burn(fast(SimMedia::None, SimFault::None), opts.clone())
                .0
                .is_err()
        );
        assert!(
            burn(fast(SimMedia::RewritableUsed, SimFault::None), opts.clone())
                .0
                .unwrap_err()
                .contains("Erase")
        );
        let (r, events, _) = burn(
            fast(SimMedia::RewritableUsed, SimFault::None),
            WriteOptions {
                erase: true,
                ..opts
            },
        );
        assert!(r.is_ok());
        assert_eq!(
            events.iter().find(|e| matches!(e, BurnEvent::Phase(_))),
            Some(&BurnEvent::Phase("Erasing the CD-RW".into()))
        );
        set_settings(SimSettings::default());
    }
}

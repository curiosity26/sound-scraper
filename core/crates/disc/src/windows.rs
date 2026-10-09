//! Windows CD writers through IMAPI2 (design §7.2): recorders from
//! IDiscMaster2, disc status from IDiscFormat2Data, burning Track-at-Once
//! with IDiscFormat2TrackAtOnce (2-second gaps, no CD-Text: IMAPI2 has no
//! CD-Text call for audio), CD-RW erase with IDiscFormat2Erase.
//!
//! Each track's audio goes to IMAPI2 through a stream that counts what the
//! drive has taken, which is the per-track progress, and fails the read when
//! the burn is cancelled.

use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

use windows::{
    Win32::{
        Foundation::{E_ABORT, VARIANT_FALSE},
        Storage::{FileSystem::FILE_ATTRIBUTE_NORMAL, Imapi::*},
        System::{
            Com::{
                CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
                ISequentialStream_Impl, IStream, IStream_Impl, LOCKTYPE, STATFLAG, STATSTG, STGC,
                STGM_READ, STGM_SHARE_DENY_WRITE, STREAM_SEEK,
            },
            Power::{ES_CONTINUOUS, ES_SYSTEM_REQUIRED, SetThreadExecutionState},
        },
        UI::Shell::SHCreateStreamOnFileEx,
    },
    core::{BSTR, HRESULT, HSTRING, Ref, implement},
};

use crate::{
    BurnEvent, Burner, Device, Media, PreparedDisc, SECTOR_BYTES, SECTORS_74, SECTORS_80,
    WriteOptions,
};

const CLIENT: &str = "Sound Scraper";

/// COM for this thread, released on drop.
struct Com(bool);

impl Com {
    fn init() -> Self {
        Self(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn err(what: &str, e: windows::core::Error) -> String {
    format!("{what}: {} (0x{:08X})", e.message(), e.code().0 as u32)
}

fn recorder(id: &str) -> Result<IDiscRecorder2, String> {
    unsafe {
        let r: IDiscRecorder2 = CoCreateInstance(&MsftDiscRecorder2, None, CLSCTX_ALL)
            .map_err(|e| err("opening the recorder", e))?;
        r.InitializeDiscRecorder(&BSTR::from(id))
            .map_err(|e| err("opening the recorder", e))?;
        Ok(r)
    }
}

fn name(r: &IDiscRecorder2) -> String {
    let vendor = unsafe { r.VendorId() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    let product = unsafe { r.ProductId() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    let n = format!("{} {}", vendor.trim(), product.trim())
        .trim()
        .to_string();
    if n.is_empty() {
        "CD recorder".into()
    } else {
        n
    }
}

fn minutes(sectors: u64) -> String {
    if sectors >= SECTORS_80 - 75 * 60 {
        "80 min".into()
    } else if sectors >= SECTORS_74 - 75 * 60 {
        "74 min".into()
    } else {
        format!("{} min", sectors / (75 * 60))
    }
}

fn media(r: &IDiscRecorder2) -> Media {
    let none = |label: &str| Media {
        state: "none".into(),
        kind: None,
        capacity: None,
        label: label.into(),
    };
    let unusable = |kind: Option<&str>, label: &str| Media {
        state: "unusable".into(),
        kind: kind.map(str::to_string),
        capacity: None,
        label: label.into(),
    };
    unsafe {
        let Ok(data) =
            CoCreateInstance::<_, IDiscFormat2Data>(&MsftDiscFormat2Data, None, CLSCTX_ALL)
        else {
            return none("No disc");
        };
        if data.SetRecorder(r).is_err() {
            return none("No disc");
        }
        let kind = match data.CurrentPhysicalMediaType() {
            Ok(t) => t,
            Err(_) => return none("No disc"),
        };
        let label = match kind {
            IMAPI_MEDIA_TYPE_CDR => "CD-R",
            IMAPI_MEDIA_TYPE_CDRW => "CD-RW",
            IMAPI_MEDIA_TYPE_UNKNOWN => return none("No disc"),
            IMAPI_MEDIA_TYPE_CDROM => return unusable(Some("CD-ROM"), "This CD can't be written"),
            _ => return unusable(None, "Not a CD: audio CDs need a CD-R or CD-RW"),
        };
        let blank = data
            .MediaPhysicallyBlank()
            .map(|b| b.as_bool())
            .unwrap_or(false)
            || data
                .MediaHeuristicallyBlank()
                .map(|b| b.as_bool())
                .unwrap_or(false);
        let free = data
            .FreeSectorsOnMedia()
            .map(|n| n.max(0) as u64)
            .unwrap_or(0);
        let total = data
            .TotalSectorsOnMedia()
            .map(|n| n.max(0) as u64)
            .unwrap_or(free);
        if blank {
            Media {
                state: "blank".into(),
                kind: Some(label.into()),
                capacity: Some(free.max(total)),
                label: format!("{label} {}, blank", minutes(free.max(total))),
            }
        } else if kind == IMAPI_MEDIA_TYPE_CDRW {
            Media {
                state: "erasable".into(),
                kind: Some(label.into()),
                capacity: Some(total),
                label: format!("CD-RW {}, not blank (erase first)", minutes(total)),
            }
        } else {
            unusable(
                Some(label),
                "This CD-R has been written: insert a blank one",
            )
        }
    }
}

/// The CD writers that can burn audio CDs.
pub fn devices() -> Vec<Device> {
    // Its own thread, so COM's apartment never clashes with the caller's.
    std::thread::spawn(|| {
        let _com = Com::init();
        let mut out = Vec::new();
        unsafe {
            let Ok(master) =
                CoCreateInstance::<_, IDiscMaster2>(&MsftDiscMaster2, None, CLSCTX_ALL)
            else {
                return out;
            };
            if !master
                .IsSupportedEnvironment()
                .map(|b| b.as_bool())
                .unwrap_or(false)
            {
                return out;
            }
            let count = master.Count().unwrap_or(0);
            for i in 0..count {
                let Ok(id) = master.get_Item(i) else { continue };
                let id = id.to_string();
                let Ok(r) = recorder(&id) else { continue };
                let Ok(tao) = CoCreateInstance::<_, IDiscFormat2TrackAtOnce>(
                    &MsftDiscFormat2TrackAtOnce,
                    None,
                    CLSCTX_ALL,
                ) else {
                    continue;
                };
                if !tao
                    .IsRecorderSupported(&r)
                    .map(|b| b.as_bool())
                    .unwrap_or(false)
                {
                    continue; // Can't write audio CDs.
                }
                out.push(Device {
                    id,
                    name: name(&r),
                    kind: "drive".into(),
                    media: media(&r),
                    speeds: Vec::new(),
                    can_test: false,
                    gapless: false,
                    cd_text: false,
                });
            }
        }
        out
    })
    .join()
    .unwrap_or_default()
}

/// A track's file, counting what IMAPI2 reads and failing once cancelled.
#[implement(IStream)]
struct CountingStream {
    inner: IStream,
    read: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
}

impl ISequentialStream_Impl for CountingStream_Impl {
    fn Read(&self, pv: *mut core::ffi::c_void, cb: u32, pcbread: *mut u32) -> HRESULT {
        if self.cancel.load(Ordering::Relaxed) {
            return E_ABORT;
        }
        let mut got = 0u32;
        let hr = unsafe { self.inner.Read(pv, cb, Some(&mut got)) };
        self.read.fetch_add(u64::from(got), Ordering::Relaxed);
        if !pcbread.is_null() {
            unsafe { *pcbread = got };
        }
        hr
    }

    fn Write(&self, _pv: *const core::ffi::c_void, _cb: u32, _pcbwritten: *mut u32) -> HRESULT {
        E_ABORT
    }
}

impl IStream_Impl for CountingStream_Impl {
    fn Seek(
        &self,
        dlibmove: i64,
        dworigin: STREAM_SEEK,
        plibnewposition: *mut u64,
    ) -> windows::core::Result<()> {
        let to = if plibnewposition.is_null() {
            None
        } else {
            Some(plibnewposition)
        };
        unsafe { self.inner.Seek(dlibmove, dworigin, to) }
    }

    fn SetSize(&self, libnewsize: u64) -> windows::core::Result<()> {
        unsafe { self.inner.SetSize(libnewsize) }
    }

    fn CopyTo(
        &self,
        pstm: Ref<IStream>,
        cb: u64,
        pcbread: *mut u64,
        pcbwritten: *mut u64,
    ) -> windows::core::Result<()> {
        let target = pstm.ok()?;
        let r = if pcbread.is_null() {
            None
        } else {
            Some(pcbread)
        };
        let w = if pcbwritten.is_null() {
            None
        } else {
            Some(pcbwritten)
        };
        unsafe { self.inner.CopyTo(target, cb, r, w) }
    }

    fn Commit(&self, grfcommitflags: &STGC) -> windows::core::Result<()> {
        unsafe { self.inner.Commit(*grfcommitflags) }
    }

    fn Revert(&self) -> windows::core::Result<()> {
        unsafe { self.inner.Revert() }
    }

    fn LockRegion(
        &self,
        liboffset: u64,
        cb: u64,
        dwlocktype: &LOCKTYPE,
    ) -> windows::core::Result<()> {
        unsafe { self.inner.LockRegion(liboffset, cb, *dwlocktype) }
    }

    fn UnlockRegion(&self, liboffset: u64, cb: u64, dwlocktype: u32) -> windows::core::Result<()> {
        unsafe { self.inner.UnlockRegion(liboffset, cb, dwlocktype) }
    }

    fn Stat(&self, pstatstg: *mut STATSTG, grfstatflag: &STATFLAG) -> windows::core::Result<()> {
        unsafe { self.inner.Stat(pstatstg, *grfstatflag) }
    }

    fn Clone(&self) -> windows::core::Result<IStream> {
        unsafe { self.inner.Clone() }
    }
}

fn open_stream(
    path: &Path,
    read: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
) -> Result<IStream, String> {
    let inner = unsafe {
        SHCreateStreamOnFileEx(
            &HSTRING::from(path.as_os_str()),
            (STGM_READ | STGM_SHARE_DENY_WRITE).0,
            FILE_ATTRIBUTE_NORMAL.0,
            false,
            None,
        )
    }
    .map_err(|e| err(&format!("opening {}", path.display()), e))?;
    Ok(CountingStream {
        inner,
        read,
        cancel,
    }
    .into())
}

pub struct ImapiBurner {
    pub device_id: String,
}

/// Keeps the PC from sleeping while it burns (a sleep ruins the disc).
struct StayAwake;

impl StayAwake {
    fn new() -> Self {
        unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) };
        Self
    }
}

impl Drop for StayAwake {
    fn drop(&mut self) {
        unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
    }
}

impl Burner for ImapiBurner {
    fn write(
        &self,
        disc: &PreparedDisc,
        options: &WriteOptions,
        events: &(dyn Fn(BurnEvent) + Sync),
        cancel: &AtomicBool,
    ) -> Result<String, String> {
        let _com = Com::init();
        let _awake = StayAwake::new();
        let r = recorder(&self.device_id)
            .map_err(|e| format!("The CD recorder isn't available: {e}"))?;
        let m = media(&r);
        let revision = unsafe { r.ProductRevision() }
            .map(|b| b.to_string())
            .unwrap_or_default();
        events(BurnEvent::Log(format!(
            "Drive: {} (firmware {}); disc: {}; Track-at-Once, 2 s gaps, no CD-Text (IMAPI2)",
            name(&r),
            revision.trim(),
            m.label
        )));
        unsafe {
            if options.erase && m.state == "erasable" {
                events(BurnEvent::Phase("Erasing the CD-RW".into()));
                let erase: IDiscFormat2Erase =
                    CoCreateInstance(&MsftDiscFormat2Erase, None, CLSCTX_ALL)
                        .map_err(|e| err("erasing", e))?;
                erase.SetRecorder(&r).map_err(|e| err("erasing", e))?;
                erase
                    .SetClientName(&BSTR::from(CLIENT))
                    .map_err(|e| err("erasing", e))?;
                erase
                    .SetFullErase(VARIANT_FALSE)
                    .map_err(|e| err("erasing", e))?;
                erase
                    .EraseMedia()
                    .map_err(|e| err("Couldn't erase the CD-RW", e))?;
                events(BurnEvent::Log("Erased the CD-RW".into()));
            }
            let tao: IDiscFormat2TrackAtOnce =
                CoCreateInstance(&MsftDiscFormat2TrackAtOnce, None, CLSCTX_ALL)
                    .map_err(|e| err("preparing", e))?;
            tao.SetRecorder(&r).map_err(|e| err("preparing", e))?;
            tao.SetClientName(&BSTR::from(CLIENT))
                .map_err(|e| err("preparing", e))?;
            if !tao
                .IsCurrentMediaSupported(&r)
                .map(|b| b.as_bool())
                .unwrap_or(false)
            {
                return Err(format!("This disc can't take an audio CD ({}).", m.label));
            }
            if options.speed > 0 {
                // Sectors per second; the drive picks the nearest it supports.
                let _ = tao.SetWriteSpeed(options.speed as i32 * 75, VARIANT_FALSE);
            }
            events(BurnEvent::Phase("Preparing the drive".into()));
            tao.PrepareMedia()
                .map_err(|e| err("Couldn't prepare the disc", e))?;
            let free = tao
                .FreeSectorsOnMedia()
                .map(|n| n.max(0) as u64)
                .unwrap_or(0);
            events(BurnEvent::Log(format!("{free} sectors free on the disc")));
            if free > 0
                && let Err(e) = disc.layout.check_fits(free + crate::FIRST_PREGAP_SECTORS)
            {
                let _ = tao.ReleaseMedia();
                return Err(e);
            }

            let result = (|| {
                let mut speed_logged = false;
                for (t, path) in disc.layout.tracks.iter().zip(&disc.files) {
                    let read = Arc::new(AtomicU64::new(0));
                    let stop = Arc::new(AtomicBool::new(false));
                    let stream = open_stream(path, read.clone(), stop.clone())?;
                    let done = AtomicBool::new(false);
                    let added = std::thread::scope(|scope| {
                        // Progress (and cancelling) while AddAudioTrack blocks.
                        scope.spawn(|| {
                            while !done.load(Ordering::Relaxed) {
                                if cancel.load(Ordering::Relaxed) {
                                    stop.store(true, Ordering::Relaxed);
                                }
                                let sectors = read.load(Ordering::Relaxed) / SECTOR_BYTES as u64;
                                events(BurnEvent::Written {
                                    sectors: t.start + sectors.min(t.sectors),
                                    speed_x: None,
                                    buffer: None,
                                });
                                std::thread::sleep(Duration::from_millis(200));
                            }
                        });
                        let r = tao.AddAudioTrack(&stream);
                        done.store(true, Ordering::Relaxed);
                        r
                    });
                    if cancel.load(Ordering::Relaxed) {
                        return Err("Cancelled.".to_string());
                    }
                    added.map_err(|e| err(&format!("Writing track {} failed", t.number), e))?;
                    events(BurnEvent::Written {
                        sectors: t.start + t.sectors,
                        speed_x: None,
                        buffer: None,
                    });
                    if !speed_logged {
                        speed_logged = true;
                        if let Ok(s) = tao.CurrentWriteSpeed() {
                            events(BurnEvent::Log(format!("Writing at {}x", s / 75)));
                        }
                    }
                }
                Ok(())
            })();
            events(BurnEvent::Phase("Closing the disc".into()));
            let released = tao.ReleaseMedia();
            result?;
            released.map_err(|e| err("Couldn't close the disc", e))?;
            if options.eject {
                let _ = r.EjectMedia();
                events(BurnEvent::Log("Ejected the disc".into()));
            }
        }
        Ok(self.device_id.clone())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_cd_writers() {
        // The VM has no CD writer: an empty list, without crashing.
        let devices = super::devices();
        for d in &devices {
            assert_eq!(d.kind, "drive");
        }
        eprintln!("CD writers: {devices:?}");
    }
}

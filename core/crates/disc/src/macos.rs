//! macOS CD writers through Disc Recording (the Objective-C bridge in
//! macos.m).

use std::{
    ffi::{CStr, CString, c_char, c_int, c_void},
    sync::atomic::{AtomicBool, Ordering},
};

use serde::Deserialize;

use crate::{BurnEvent, Burner, Device, PreparedDisc, WriteOptions};

type EventCallback = extern "C" fn(*mut c_void, *const c_char) -> c_int;

unsafe extern "C" {
    fn ssdr_devices_json() -> *mut c_char;
    fn ssdr_burn(request_json: *const c_char, ctx: *mut c_void, cb: EventCallback, error_out: *mut *mut c_char) -> c_int;
    fn ssdr_free(s: *mut c_char);
}

fn take(s: *mut c_char) -> String {
    if s.is_null() {
        return String::new();
    }
    let out = unsafe { CStr::from_ptr(s) }.to_string_lossy().into_owned();
    unsafe { ssdr_free(s) };
    out
}

/// The CD writers attached now.
pub fn devices() -> Vec<Device> {
    serde_json::from_str(&take(unsafe { ssdr_devices_json() })).unwrap_or_default()
}

pub struct DiscRecordingBurner {
    pub device_id: String,
}

#[derive(Deserialize)]
struct Event {
    phase: Option<String>,
    log: Option<String>,
    written: Option<u64>,
    speed: Option<f64>,
}

struct Context<'a> {
    events: &'a (dyn Fn(BurnEvent) + Sync),
    cancel: &'a AtomicBool,
}

extern "C" fn on_event(ctx: *mut c_void, json: *const c_char) -> c_int {
    let ctx = unsafe { &*(ctx as *const Context) };
    let text = unsafe { CStr::from_ptr(json) }.to_string_lossy();
    if let Ok(e) = serde_json::from_str::<Event>(&text) {
        if let Some(p) = e.phase {
            (ctx.events)(BurnEvent::Phase(p));
        }
        if let Some(l) = e.log {
            (ctx.events)(BurnEvent::Log(l));
        }
        if let Some(sectors) = e.written {
            (ctx.events)(BurnEvent::Written { sectors, speed_x: e.speed, buffer: None });
        }
    }
    c_int::from(ctx.cancel.load(Ordering::Relaxed))
}

impl Burner for DiscRecordingBurner {
    fn write(
        &self,
        disc: &PreparedDisc,
        options: &WriteOptions,
        events: &(dyn Fn(BurnEvent) + Sync),
        cancel: &AtomicBool,
    ) -> Result<String, String> {
        let tracks: Vec<_> = disc
            .layout
            .tracks
            .iter()
            .zip(&disc.tracks)
            .zip(&disc.files)
            .map(|((t, info), path)| {
                serde_json::json!({
                    "path": path.to_string_lossy(),
                    "sectors": t.sectors,
                    // Track 1's pregap is always 2 s; the rest are the gaps.
                    "pregap": if t.number == 1 { crate::FIRST_PREGAP_SECTORS } else { t.gap },
                    "title": info.title,
                    "performer": info.performer,
                })
            })
            .collect();
        let request = serde_json::json!({
            "deviceId": self.device_id,
            "tracks": tracks,
            "title": disc.title,
            "performer": disc.performer,
            "speed": options.speed,
            "test": options.test_write,
            "cdText": options.cd_text,
            "eject": options.eject,
            "erase": options.erase,
            // Diagnostics: in case a drive wants big-endian audio.
            "swapBytes": std::env::var("SS_BURN_SWAP_BYTES").is_ok_and(|v| v == "1"),
        });
        let request = CString::new(request.to_string()).map_err(|e| e.to_string())?;
        let ctx = Context { events, cancel };
        let mut error: *mut c_char = std::ptr::null_mut();
        let result = unsafe { ssdr_burn(request.as_ptr(), &ctx as *const Context as *mut c_void, on_event, &mut error) };
        match result {
            0 => Ok(self.device_id.clone()),
            1 => Err("Cancelled.".into()),
            _ => Err(take(error)),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_cd_writers() {
        // No burner on the build machines: an empty list, without crashing.
        let devices = super::devices();
        for d in &devices {
            assert_eq!(d.kind, "drive");
        }
        eprintln!("CD writers: {devices:?}");
    }
}

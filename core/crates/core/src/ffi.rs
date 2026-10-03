//! C ABI consumed by the native modules (Objective-C++ on macOS,
//! C++/WinRT on Windows). cbindgen turns this file into
//! `core/include/sound_scraper.h`.
//!
//! Rules: opaque handles and plain `#[repr(C)]` types only, every function
//! is `ss_`-prefixed, and nothing here panics across the boundary.

use std::{
    cell::RefCell,
    ffi::{CString, c_char},
    panic::{AssertUnwindSafe, catch_unwind},
    ptr,
};

use crate::{
    capture_test,
    recorder::{Recorder, RecorderState},
};

/// Opaque recorder handle. Create with `ss_recorder_create`, free with
/// `ss_recorder_destroy`.
pub struct SsRecorder {
    inner: Recorder,
}

/// Recorder state as seen from C.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsRecorderState {
    Idle = 0,
    Recording = 1,
    Paused = 2,
    Finalizing = 3,
}

impl From<RecorderState> for SsRecorderState {
    fn from(state: RecorderState) -> Self {
        match state {
            RecorderState::Idle => Self::Idle,
            RecorderState::Recording => Self::Recording,
            RecorderState::Paused => Self::Paused,
            RecorderState::Finalizing => Self::Finalizing,
        }
    }
}

static VERSION_C: &str = concat!(env!("CARGO_PKG_VERSION"), "\0");

/// Core version as a NUL-terminated UTF-8 string with static lifetime.
/// The caller must not free it.
#[unsafe(no_mangle)]
pub extern "C" fn ss_version() -> *const c_char {
    VERSION_C.as_ptr().cast()
}

/// Creates a recorder in the Idle state. Never returns NULL.
#[unsafe(no_mangle)]
pub extern "C" fn ss_recorder_create() -> *mut SsRecorder {
    Box::into_raw(Box::new(SsRecorder { inner: Recorder::new() }))
}

/// Destroys a recorder. Passing NULL is a no-op.
///
/// # Safety
/// `recorder` must be NULL or a handle from `ss_recorder_create` that has
/// not already been destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_destroy(recorder: *mut SsRecorder) {
    if !recorder.is_null() {
        drop(unsafe { Box::from_raw(recorder) });
    }
}

/// Current state of `recorder`; Idle when `recorder` is NULL.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_state(recorder: *const SsRecorder) -> SsRecorderState {
    match unsafe { recorder.as_ref() } {
        Some(r) => r.inner.state().into(),
        None => SsRecorderState::Idle,
    }
}

/// Result of a fallible call. On `SS_STATUS_ERROR`, `ss_last_error_message`
/// describes the failure.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsStatus {
    Ok = 0,
    Error = 1,
}

thread_local! {
    static LAST_ERROR: RefCell<CString> = RefCell::new(CString::default());
}

fn fail(message: impl Into<String>) -> SsStatus {
    let message = CString::new(message.into().replace('\0', " ")).unwrap_or_default();
    LAST_ERROR.with(|e| *e.borrow_mut() = message);
    SsStatus::Error
}

/// Message for the last `SS_STATUS_ERROR` returned on this thread. Valid until
/// the next failing call on the same thread; the caller must not free it.
#[unsafe(no_mangle)]
pub extern "C" fn ss_last_error_message() -> *const c_char {
    LAST_ERROR.with(|e| e.borrow().as_ptr())
}

/// An app that can be recorded on its own. Strings are UTF-8 and owned by the
/// list they came from.
#[repr(C)]
pub struct SsAudioApp {
    pub pid: u32,
    pub name: *const c_char,
    /// NULL when the process has no bundle ID.
    pub bundle_id: *const c_char,
    pub is_playing: bool,
}

/// Opaque list of apps from `ss_audio_apps_list`.
pub struct SsAudioAppList {
    apps: Vec<SsAudioApp>,
    _strings: Vec<CString>,
}

/// Apps with audio processes, those playing sound first. Free with
/// `ss_audio_app_list_free`. Never returns NULL.
#[unsafe(no_mangle)]
pub extern "C" fn ss_audio_apps_list() -> *mut SsAudioAppList {
    let found = catch_unwind(capture_test::audio_apps).unwrap_or_default();
    let mut strings = Vec::new();
    let mut apps = Vec::new();
    for app in found {
        let name = CString::new(app.name.replace('\0', " ")).unwrap_or_default();
        let bundle_id = app.bundle_id.and_then(|b| CString::new(b).ok());
        apps.push(SsAudioApp {
            pid: app.pid,
            name: name.as_ptr(),
            bundle_id: bundle_id.as_ref().map_or(ptr::null(), |b| b.as_ptr()),
            is_playing: app.is_playing,
        });
        strings.push(name);
        strings.extend(bundle_id);
    }
    Box::into_raw(Box::new(SsAudioAppList { apps, _strings: strings }))
}

/// Number of apps in `list` (0 for NULL).
///
/// # Safety
/// `list` must be NULL or a live list from `ss_audio_apps_list`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_audio_app_list_len(list: *const SsAudioAppList) -> usize {
    unsafe { list.as_ref() }.map_or(0, |l| l.apps.len())
}

/// App at `index`, or NULL when out of range. Valid until the list is freed.
///
/// # Safety
/// `list` must be NULL or a live list from `ss_audio_apps_list`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_audio_app_list_get(list: *const SsAudioAppList, index: usize) -> *const SsAudioApp {
    unsafe { list.as_ref() }
        .and_then(|l| l.apps.get(index))
        .map_or(ptr::null(), |a| a as *const SsAudioApp)
}

/// Frees a list from `ss_audio_apps_list`. NULL is a no-op.
///
/// # Safety
/// `list` must be NULL or a list that has not already been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_audio_app_list_free(list: *mut SsAudioAppList) {
    if !list.is_null() {
        drop(unsafe { Box::from_raw(list) });
    }
}

/// Outcome of `ss_capture_test_wav`. Free `path` with `ss_capture_report_free`.
#[repr(C)]
pub struct SsCaptureReport {
    /// UTF-8 path of the WAV file that was written.
    pub path: *mut c_char,
    pub frames: u64,
    pub sample_rate: u32,
    pub channels: u16,
    /// Largest absolute sample; 0 means the recording was silent.
    pub peak: f32,
}

/// Records `seconds` of audio to a WAV file in the recordings folder: one
/// app's audio when `app_pid` is non-zero, otherwise all system audio.
/// Blocks for the duration, so call it off the UI thread.
///
/// # Safety
/// `out_report` must point to writable memory for one `SsCaptureReport`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_capture_test_wav(app_pid: u32, seconds: f64, out_report: *mut SsCaptureReport) -> SsStatus {
    if out_report.is_null() {
        return fail("out_report is NULL");
    }
    let pid = (app_pid != 0).then_some(app_pid);
    match catch_unwind(AssertUnwindSafe(|| capture_test::record_test_wav(pid, seconds))) {
        Ok(Ok(r)) => {
            let path = CString::new(r.path.to_string_lossy().into_owned()).unwrap_or_default();
            unsafe {
                out_report.write(SsCaptureReport {
                    path: path.into_raw(),
                    frames: r.frames,
                    sample_rate: r.sample_rate,
                    channels: r.channels,
                    peak: r.peak,
                });
            }
            SsStatus::Ok
        }
        Ok(Err(message)) => fail(message),
        Err(_) => fail("capture panicked"),
    }
}

/// Frees the strings inside a report filled by `ss_capture_test_wav`.
///
/// # Safety
/// `report` must be NULL or a report filled by `ss_capture_test_wav` that has
/// not already been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_capture_report_free(report: *mut SsCaptureReport) {
    if let Some(r) = unsafe { report.as_mut() } {
        if !r.path.is_null() {
            drop(unsafe { CString::from_raw(r.path) });
            r.path = ptr::null_mut();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;

    #[test]
    fn version_matches_crate() {
        let v = unsafe { CStr::from_ptr(ss_version()) };
        assert_eq!(v.to_str().unwrap(), crate::VERSION);
    }

    #[test]
    fn recorder_lifecycle() {
        let r = ss_recorder_create();
        assert!(!r.is_null());
        assert_eq!(unsafe { ss_recorder_state(r) }, SsRecorderState::Idle);
        unsafe { ss_recorder_destroy(r) };
        unsafe { ss_recorder_destroy(std::ptr::null_mut()) };
    }

    #[test]
    fn capture_rejects_bad_arguments() {
        let status = unsafe { ss_capture_test_wav(0, 1.0, ptr::null_mut()) };
        assert_eq!(status, SsStatus::Error);
        let message = unsafe { CStr::from_ptr(ss_last_error_message()) };
        assert_eq!(message.to_str().unwrap(), "out_report is NULL");
    }

    #[test]
    fn app_list_handles_null() {
        assert_eq!(unsafe { ss_audio_app_list_len(ptr::null()) }, 0);
        assert!(unsafe { ss_audio_app_list_get(ptr::null(), 0) }.is_null());
        unsafe { ss_audio_app_list_free(ptr::null_mut()) };
    }
}

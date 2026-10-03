//! C ABI consumed by the native modules (Objective-C++ on macOS,
//! C++/WinRT on Windows). cbindgen turns this file into
//! `core/include/sound_scraper.h`.
//!
//! Rules: opaque handles and plain `#[repr(C)]` types only, every function
//! is `ss_`-prefixed, and nothing here panics across the boundary.

use std::{
    cell::RefCell,
    ffi::{CString, c_char, c_void},
    panic::{AssertUnwindSafe, catch_unwind},
    ptr,
    sync::{Arc, Mutex},
};

use crate::{
    capture_test, paths,
    recorder::{self, Recorder, RecorderEvent, RecorderState, Status},
    sources,
};

/// Opaque recorder handle. Create with `ss_recorder_create`, free with
/// `ss_recorder_destroy`. Its functions may be called from any thread.
pub struct SsRecorder {
    inner: Mutex<Recorder>,
    status: Arc<Status>,
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

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsRecorderEventKind {
    /// `state` changed.
    StateChanged = 0,
    /// About 10 Hz while recording or paused: `elapsed_ms`, `peak`, `rms`.
    Progress = 1,
    /// A recording was finalized at `path`.
    Finished = 2,
    /// Recording failed; see `message`.
    Error = 3,
}

/// A recorder event. Pointers are valid only during the callback.
#[repr(C)]
pub struct SsRecorderEvent {
    pub kind: SsRecorderEventKind,
    pub state: SsRecorderState,
    /// Recorded time, excluding pauses.
    pub elapsed_ms: u64,
    /// Linear levels (0..1) over the last interval; 0 while paused.
    pub peak: f32,
    pub rms: f32,
    /// UTF-8; non-NULL for `SS_RECORDER_EVENT_KIND_FINISHED` only.
    pub path: *const c_char,
    /// UTF-8; non-NULL for `SS_RECORDER_EVENT_KIND_ERROR` only.
    pub message: *const c_char,
}

/// Receives recorder events, on a recorder thread or the calling thread.
/// It must return quickly and must not call back into the same recorder.
pub type SsRecorderCallback = Option<unsafe extern "C" fn(event: *const SsRecorderEvent, user_data: *mut c_void)>;

static VERSION_C: &str = concat!(env!("CARGO_PKG_VERSION"), "\0");

/// Core version as a NUL-terminated UTF-8 string with static lifetime.
/// The caller must not free it.
#[unsafe(no_mangle)]
pub extern "C" fn ss_version() -> *const c_char {
    VERSION_C.as_ptr().cast()
}

/// Creates a recorder in the Idle state that saves to the default recordings
/// folder. Never returns NULL.
#[unsafe(no_mangle)]
pub extern "C" fn ss_recorder_create() -> *mut SsRecorder {
    let recorder = Recorder::new();
    let status = recorder.status();
    Box::into_raw(Box::new(SsRecorder { inner: Mutex::new(recorder), status }))
}

/// Destroys a recorder, finalizing any recording in progress. NULL is a no-op.
///
/// # Safety
/// `recorder` must be NULL or a handle from `ss_recorder_create` that has
/// not already been destroyed, with no other call on it in progress.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_destroy(recorder: *mut SsRecorder) {
    if !recorder.is_null() {
        drop(unsafe { Box::from_raw(recorder) });
    }
}

/// Current state of `recorder`; Idle when `recorder` is NULL. Never blocks.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_state(recorder: *const SsRecorder) -> SsRecorderState {
    unsafe { recorder.as_ref() }.map_or(SsRecorderState::Idle, |r| r.status.state().into())
}

/// Recorded time in milliseconds, excluding pauses. Never blocks.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_elapsed_ms(recorder: *const SsRecorder) -> u64 {
    unsafe { recorder.as_ref() }.map_or(0, |r| r.status.elapsed().as_millis() as u64)
}

struct CallbackTarget {
    callback: unsafe extern "C" fn(*const SsRecorderEvent, *mut c_void),
    user_data: *mut c_void,
}

// The caller promises user_data may be used from recorder threads.
unsafe impl Send for CallbackTarget {}
unsafe impl Sync for CallbackTarget {}

/// Sets (or with NULL, clears) the event callback. Only while Idle.
///
/// # Safety
/// `recorder` must be a live handle; `user_data` must stay valid, and be
/// usable from any thread, until the callback is replaced or the recorder
/// is destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_set_callback(
    recorder: *mut SsRecorder,
    callback: SsRecorderCallback,
    user_data: *mut c_void,
) -> SsStatus {
    let Some(r) = (unsafe { recorder.as_ref() }) else { return fail("recorder is NULL") };
    let mut inner = r.inner.lock().unwrap_or_else(|e| e.into_inner());
    if inner.state() != RecorderState::Idle {
        return fail("the callback can only be changed while idle");
    }
    let sink: Option<recorder::EventSink> = callback.map(|callback| {
        let target = CallbackTarget { callback, user_data };
        let status = r.status.clone();
        Arc::new(move |event: &RecorderEvent| deliver(&target, &status, event)) as recorder::EventSink
    });
    inner.set_event_sink(sink);
    SsStatus::Ok
}

fn deliver(target: &CallbackTarget, status: &Status, event: &RecorderEvent) {
    let mut c = SsRecorderEvent {
        kind: SsRecorderEventKind::StateChanged,
        state: status.state().into(),
        elapsed_ms: status.elapsed().as_millis() as u64,
        peak: 0.0,
        rms: 0.0,
        path: ptr::null(),
        message: ptr::null(),
    };
    let text;
    match event {
        RecorderEvent::StateChanged(state) => c.state = (*state).into(),
        RecorderEvent::Progress { elapsed, peak, rms } => {
            c.kind = SsRecorderEventKind::Progress;
            c.elapsed_ms = elapsed.as_millis() as u64;
            (c.peak, c.rms) = (*peak, *rms);
        }
        RecorderEvent::Finished { path } => {
            c.kind = SsRecorderEventKind::Finished;
            text = CString::new(path.to_string_lossy().into_owned()).unwrap_or_default();
            c.path = text.as_ptr();
        }
        RecorderEvent::Error { message } => {
            c.kind = SsRecorderEventKind::Error;
            text = CString::new(message.replace('\0', " ")).unwrap_or_default();
            c.message = text.as_ptr();
        }
    }
    unsafe { (target.callback)(&c, target.user_data) };
}

fn with_recorder(
    recorder: *const SsRecorder,
    f: impl FnOnce(&mut Recorder) -> Result<(), String>,
) -> SsStatus {
    let Some(r) = (unsafe { recorder.as_ref() }) else { return fail("recorder is NULL") };
    let result = catch_unwind(AssertUnwindSafe(|| {
        let mut inner = r.inner.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut inner)
    }));
    match result {
        Ok(Ok(())) => SsStatus::Ok,
        Ok(Err(message)) => fail(message),
        Err(_) => fail("recorder panicked"),
    }
}

/// Starts recording one app (`app_pid` non-zero) or all system audio
/// (`app_pid` 0) to a new `.mp3.part` in the recordings folder. May block
/// while macOS asks for the audio-capture permission; call off the UI thread.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_start(recorder: *mut SsRecorder, app_pid: u32) -> SsStatus {
    with_recorder(recorder, |r| r.start(sources::source_for_pid((app_pid != 0).then_some(app_pid))))
}

/// Pauses: the file and encoder stay open and incoming audio is dropped.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_pause(recorder: *mut SsRecorder) -> SsStatus {
    with_recorder(recorder, Recorder::pause)
}

/// Resumes after `ss_recorder_pause`.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_resume(recorder: *mut SsRecorder) -> SsStatus {
    with_recorder(recorder, Recorder::resume)
}

/// Stops and finalizes (flush, Xing/LAME tag, ID3 tags, rename to `.mp3`).
/// Blocks until done. On success `*out_path` (if not NULL) receives the
/// file's UTF-8 path, to be freed with `ss_string_free`.
///
/// # Safety
/// `recorder` must be NULL or a live handle; `out_path` must be NULL or
/// writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recorder_stop(recorder: *mut SsRecorder, out_path: *mut *mut c_char) -> SsStatus {
    with_recorder(recorder, |r| {
        let path = r.stop()?;
        if !out_path.is_null() {
            let c = CString::new(path.to_string_lossy().into_owned()).unwrap_or_default();
            unsafe { out_path.write(c.into_raw()) };
        }
        Ok(())
    })
}

/// Finishes `.mp3.part` files left in the recordings folder by a crash.
/// Returns how many were recovered, or -1 on error. Call at startup, before
/// any recording starts.
#[unsafe(no_mangle)]
pub extern "C" fn ss_recover_partial_recordings() -> i32 {
    catch_unwind(|| recorder::recover_partials(&paths::recordings_dir()).iter().filter(|r| r.is_ok()).count() as i32)
        .unwrap_or(-1)
}

/// Frees a string returned by this library. NULL is a no-op.
///
/// # Safety
/// `s` must be NULL or a string from this library not already freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_string_free(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });
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
    let found = catch_unwind(sources::audio_apps).unwrap_or_default();
    let mut strings = Vec::new();
    let mut apps = Vec::new();
    for app in found {
        let name = CString::new(app.name.replace('\0', " ")).unwrap_or_default();
        let bundle_id = app.bundle_id.and_then(|b| CString::new(b).ok());
        apps.push(SsAudioApp {
            pid: app.pid,
            name: name.as_ptr(),
            bundle_id: bundle_id.as_ref().map_or(ptr::null(), |b: &CString| b.as_ptr()),
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
    if let Some(r) = unsafe { report.as_mut() }
        && !r.path.is_null()
    {
        drop(unsafe { CString::from_raw(r.path) });
        r.path = ptr::null_mut();
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

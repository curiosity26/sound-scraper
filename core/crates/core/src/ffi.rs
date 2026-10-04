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
    capture_test,
    library::{Library, Recording},
    recorder::{self, Recorder, RecorderEvent, RecorderState, Status},
    settings, skins, sources,
    tags::{CoverEdit, TagEdit, TagVersion},
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
    /// Linear levels (0..1) over the last interval, the louder channel's
    /// peak and the channels' mean RMS (`peak_left` etc. give each channel).
    /// They keep moving while paused.
    pub peak: f32,
    pub rms: f32,
    pub peak_left: f32,
    pub peak_right: f32,
    pub rms_left: f32,
    pub rms_right: f32,
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
        peak_left: 0.0,
        peak_right: 0.0,
        rms_left: 0.0,
        rms_right: 0.0,
        path: ptr::null(),
        message: ptr::null(),
    };
    let text;
    match event {
        RecorderEvent::StateChanged(state) => c.state = (*state).into(),
        RecorderEvent::Progress { elapsed, peak, rms } => {
            c.kind = SsRecorderEventKind::Progress;
            c.elapsed_ms = elapsed.as_millis() as u64;
            (c.peak, c.rms) = (peak[0].max(peak[1]), (rms[0] + rms[1]) / 2.0);
            [c.peak_left, c.peak_right] = *peak;
            [c.rms_left, c.rms_right] = *rms;
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
    with_recorder(recorder, |r| {
        let s = settings::load();
        r.set_options(recorder::RecorderOptions { dir: s.recordings_dir(), quality: s.quality, tag_version: s.tag_version() });
        r.start(sources::source_for_pid((app_pid != 0).then_some(app_pid)))
    })
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
    catch_unwind(|| {
        let s = settings::load();
        recorder::recover_partials(&s.recordings_dir(), s.tag_version())
    }.iter().filter(|r| r.is_ok()).count() as i32)
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

/// Opaque handle to the recordings library (`~/Music/Sound Scraper`).
/// Its functions may be called from any thread.
pub struct SsLibrary {
    inner: Mutex<Library>,
}

/// One recording. Strings are UTF-8 and owned by the list.
#[repr(C)]
pub struct SsRecording {
    /// Name inside the recordings folder; pass it to the other library calls.
    pub file_name: *const c_char,
    pub path: *const c_char,
    /// ID3 title, or the file name without extension.
    pub title: *const c_char,
    /// NULL when not tagged.
    pub artist: *const c_char,
    /// NULL when not tagged.
    pub album: *const c_char,
    pub duration_ms: u64,
    pub size_bytes: u64,
    /// Unix time in milliseconds.
    pub recorded_at_ms: i64,
}

/// Opaque list from `ss_library_list`.
pub struct SsRecordingList {
    items: Vec<SsRecording>,
    _strings: Vec<CString>,
}

/// Called (debounced, on a watcher thread) when recordings are added,
/// removed or changed on disk.
pub type SsLibraryCallback = Option<unsafe extern "C" fn(user_data: *mut c_void)>;

/// Opens the default library, creating the folder and index if needed.
/// Returns NULL on failure (see `ss_last_error_message`).
#[unsafe(no_mangle)]
pub extern "C" fn ss_library_open() -> *mut SsLibrary {
    match catch_unwind(Library::open_default) {
        Ok(Ok(library)) => Box::into_raw(Box::new(SsLibrary { inner: Mutex::new(library) })),
        Ok(Err(message)) => {
            fail(message);
            ptr::null_mut()
        }
        Err(_) => {
            fail("opening the library panicked");
            ptr::null_mut()
        }
    }
}

/// Closes a library (stopping its watcher). NULL is a no-op.
///
/// # Safety
/// `library` must be NULL or a handle from `ss_library_open` not already
/// destroyed, with no other call on it in progress.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_destroy(library: *mut SsLibrary) {
    if !library.is_null() {
        drop(unsafe { Box::from_raw(library) });
    }
}

fn with_library<T>(library: *const SsLibrary, f: impl FnOnce(&mut Library) -> Result<T, String>) -> Result<T, SsStatus> {
    let Some(l) = (unsafe { library.as_ref() }) else { return Err(fail("library is NULL")) };
    match catch_unwind(AssertUnwindSafe(|| f(&mut l.inner.lock().unwrap_or_else(|e| e.into_inner())))) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(message)) => Err(fail(message)),
        Err(_) => Err(fail("library call panicked")),
    }
}

/// Borrows a C string argument as UTF-8.
unsafe fn arg_str<'a>(s: *const c_char, name: &str) -> Result<&'a str, String> {
    if s.is_null() {
        return Err(format!("{name} is NULL"));
    }
    unsafe { std::ffi::CStr::from_ptr(s) }.to_str().map_err(|_| format!("{name} is not UTF-8"))
}

fn c_string(s: &str) -> CString {
    CString::new(s.replace('\0', " ")).unwrap_or_default()
}

/// Rescans the folder and returns the recordings, newest first. Free with
/// `ss_recording_list_free`. Returns NULL on failure.
///
/// # Safety
/// `library` must be NULL or a live handle from `ss_library_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_list(library: *mut SsLibrary) -> *mut SsRecordingList {
    let Ok(recordings) = with_library(library, Library::list) else { return ptr::null_mut() };
    let mut strings = Vec::new();
    let mut keep = |s: Option<&str>| -> *const c_char {
        match s {
            Some(s) => {
                let c = c_string(s);
                let p = c.as_ptr();
                strings.push(c);
                p
            }
            None => ptr::null(),
        }
    };
    let items = recordings
        .iter()
        .map(|r: &Recording| SsRecording {
            file_name: keep(Some(&r.file_name)),
            path: keep(Some(&r.path.to_string_lossy())),
            title: keep(Some(&r.title)),
            artist: keep(r.artist.as_deref()),
            album: keep(r.album.as_deref()),
            duration_ms: r.duration_ms,
            size_bytes: r.size_bytes,
            recorded_at_ms: r.recorded_at_ms,
        })
        .collect();
    Box::into_raw(Box::new(SsRecordingList { items, _strings: strings }))
}

/// Number of recordings in `list` (0 for NULL).
///
/// # Safety
/// `list` must be NULL or a live list from `ss_library_list`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recording_list_len(list: *const SsRecordingList) -> usize {
    unsafe { list.as_ref() }.map_or(0, |l| l.items.len())
}

/// Recording at `index`, or NULL when out of range. Valid until the list is freed.
///
/// # Safety
/// `list` must be NULL or a live list from `ss_library_list`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recording_list_get(list: *const SsRecordingList, index: usize) -> *const SsRecording {
    unsafe { list.as_ref() }
        .and_then(|l| l.items.get(index))
        .map_or(ptr::null(), |r| r as *const SsRecording)
}

/// Frees a list from `ss_library_list`. NULL is a no-op.
///
/// # Safety
/// `list` must be NULL or a list not already freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_recording_list_free(list: *mut SsRecordingList) {
    if !list.is_null() {
        drop(unsafe { Box::from_raw(list) });
    }
}

/// Renames a recording (sanitized, `.mp3` kept, " (2)" on collision; the
/// ID3 title follows if it still matched the old name). On success
/// `*out_file_name` (if not NULL) receives the new file name, to be freed
/// with `ss_string_free`.
///
/// # Safety
/// `library` must be a live handle; `file_name` and `new_name` must be
/// NUL-terminated UTF-8; `out_file_name` must be NULL or writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_rename(
    library: *mut SsLibrary,
    file_name: *const c_char,
    new_name: *const c_char,
    out_file_name: *mut *mut c_char,
) -> SsStatus {
    let result = with_library(library, |l| {
        let renamed = l.rename(unsafe { arg_str(file_name, "file_name")? }, unsafe { arg_str(new_name, "new_name")? })?;
        if !out_file_name.is_null() {
            unsafe { out_file_name.write(c_string(&renamed).into_raw()) };
        }
        Ok(())
    });
    result.map_or_else(|status| status, |()| SsStatus::Ok)
}

/// Moves a recording to the Trash / Recycle Bin.
///
/// # Safety
/// `library` must be a live handle; `file_name` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_trash(library: *mut SsLibrary, file_name: *const c_char) -> SsStatus {
    with_library(library, |l| l.trash(unsafe { arg_str(file_name, "file_name")? }))
        .map_or_else(|status| status, |()| SsStatus::Ok)
}

/// Shows the recording selected in Finder / Explorer.
///
/// # Safety
/// `library` must be a live handle; `file_name` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_reveal(library: *mut SsLibrary, file_name: *const c_char) -> SsStatus {
    with_library(library, |l| l.reveal(unsafe { arg_str(file_name, "file_name")? }))
        .map_or_else(|status| status, |()| SsStatus::Ok)
}

/// Starts watching the folder; `callback(user_data)` fires on changes.
/// NULL callback stops watching.
///
/// # Safety
/// `library` must be a live handle; `user_data` must stay valid, and be
/// usable from any thread, until the callback is replaced or the library
/// is destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_set_callback(
    library: *mut SsLibrary,
    callback: SsLibraryCallback,
    user_data: *mut c_void,
) -> SsStatus {
    struct Target(unsafe extern "C" fn(*mut c_void), *mut c_void);
    // The caller promises user_data may be used from the watcher thread.
    unsafe impl Send for Target {}
    unsafe impl Sync for Target {}
    impl Target {
        fn call(&self) {
            unsafe { (self.0)(self.1) }
        }
    }

    with_library(library, |l| match callback {
        Some(callback) => {
            let target = Target(callback, user_data);
            l.watch(move || target.call())
        }
        None => {
            l.unwatch();
            Ok(())
        }
    })
    .map_or_else(|status| status, |()| SsStatus::Ok)
}

/// A recording's editable tags. Strings are UTF-8, NULL when not set, and
/// owned by this struct; free it with `ss_tags_free`.
#[repr(C)]
pub struct SsTags {
    pub title: *const c_char,
    pub artist: *const c_char,
    pub album: *const c_char,
    pub album_artist: *const c_char,
    /// "YYYY", "YYYY-MM" or "YYYY-MM-DD".
    pub date: *const c_char,
    pub genre: *const c_char,
    pub comment: *const c_char,
    /// Track number; 0 when not set.
    pub track: u32,
    /// Path of the embedded front cover, extracted to the app's cover cache
    /// (NULL when there is no cover).
    pub cover_path: *const c_char,
}

#[repr(C)]
struct SsTagsOwned {
    tags: SsTags, // first, so a *SsTags is a *SsTagsOwned
    strings: Vec<CString>,
}

/// Bits for `SsTagEdit::set_mask`: which fields the edit changes.
pub const SS_TAG_TITLE: u32 = 1 << 0;
pub const SS_TAG_ARTIST: u32 = 1 << 1;
pub const SS_TAG_ALBUM: u32 = 1 << 2;
pub const SS_TAG_ALBUM_ARTIST: u32 = 1 << 3;
pub const SS_TAG_DATE: u32 = 1 << 4;
pub const SS_TAG_TRACK: u32 = 1 << 5;
pub const SS_TAG_GENRE: u32 = 1 << 6;
pub const SS_TAG_COMMENT: u32 = 1 << 7;

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsCoverEdit {
    Keep = 0,
    Remove = 1,
    /// Embed the JPEG/PNG at `cover_path`.
    Set = 2,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsTagVersion {
    Id3v24 = 0,
    Id3v23 = 1,
}

/// A tag change for one or more recordings. Fields whose bit is not in
/// `set_mask` are left alone; a set field with a NULL or empty string (or
/// `track` 0) is cleared.
#[repr(C)]
pub struct SsTagEdit {
    pub set_mask: u32,
    pub title: *const c_char,
    pub artist: *const c_char,
    pub album: *const c_char,
    pub album_artist: *const c_char,
    pub date: *const c_char,
    pub genre: *const c_char,
    pub comment: *const c_char,
    pub track: u32,
    pub cover: SsCoverEdit,
    pub cover_path: *const c_char,
    pub version: SsTagVersion,
}

/// Reads a recording's tags (and extracts its cover). Returns NULL on
/// failure (see `ss_last_error_message`).
///
/// # Safety
/// `library` must be a live handle; `file_name` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_read_tags(library: *mut SsLibrary, file_name: *const c_char) -> *const SsTags {
    let read = with_library(library, |l| {
        let name = unsafe { arg_str(file_name, "file_name")? };
        Ok((l.read_tags(name)?, l.export_cover(name)?))
    });
    let Ok((fields, cover)) = read else { return ptr::null() };
    let mut strings = Vec::new();
    let mut keep = |s: Option<&str>| -> *const c_char {
        s.map_or(ptr::null(), |s| {
            let c = c_string(s);
            let p = c.as_ptr();
            strings.push(c);
            p
        })
    };
    let tags = SsTags {
        title: keep(fields.title.as_deref()),
        artist: keep(fields.artist.as_deref()),
        album: keep(fields.album.as_deref()),
        album_artist: keep(fields.album_artist.as_deref()),
        date: keep(fields.date.as_deref()),
        genre: keep(fields.genre.as_deref()),
        comment: keep(fields.comment.as_deref()),
        track: fields.track.unwrap_or(0),
        cover_path: keep(cover.as_ref().map(|p| p.to_string_lossy()).as_deref()),
    };
    Box::into_raw(Box::new(SsTagsOwned { tags, strings })).cast_const().cast()
}

/// Frees tags from `ss_library_read_tags`. NULL is a no-op.
///
/// # Safety
/// `tags` must be NULL or a pointer from `ss_library_read_tags` not already freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_tags_free(tags: *const SsTags) {
    if !tags.is_null() {
        drop(unsafe { Box::from_raw(tags.cast_mut().cast::<SsTagsOwned>()) });
    }
}

/// Applies `edit` to each of `count` recordings (bulk edit), atomically per
/// file. All names are checked before anything is written.
///
/// # Safety
/// `library` must be a live handle; `file_names` must point to `count`
/// NUL-terminated UTF-8 strings; `edit` must be valid, with its strings
/// NULL or NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_write_tags(
    library: *mut SsLibrary,
    file_names: *const *const c_char,
    count: usize,
    edit: *const SsTagEdit,
) -> SsStatus {
    with_library(library, |l| {
        let e = unsafe { edit.as_ref() }.ok_or("edit is NULL")?;
        if file_names.is_null() && count > 0 {
            return Err("file_names is NULL".into());
        }
        let names = (0..count)
            .map(|i| unsafe { arg_str(*file_names.add(i), "file_names[i]") }.map(str::to_string))
            .collect::<Result<Vec<_>, _>>()?;
        let text = |bit: u32, s: *const c_char| -> Result<Option<Option<String>>, String> {
            if e.set_mask & bit == 0 {
                return Ok(None);
            }
            if s.is_null() {
                return Ok(Some(None));
            }
            Ok(Some(Some(unsafe { arg_str(s, "tag field")? }.to_string())))
        };
        let edit = TagEdit {
            title: text(SS_TAG_TITLE, e.title)?,
            artist: text(SS_TAG_ARTIST, e.artist)?,
            album: text(SS_TAG_ALBUM, e.album)?,
            album_artist: text(SS_TAG_ALBUM_ARTIST, e.album_artist)?,
            date: text(SS_TAG_DATE, e.date)?,
            genre: text(SS_TAG_GENRE, e.genre)?,
            comment: text(SS_TAG_COMMENT, e.comment)?,
            track: (e.set_mask & SS_TAG_TRACK != 0).then_some((e.track > 0).then_some(e.track)),
            cover: match e.cover {
                SsCoverEdit::Keep => CoverEdit::Keep,
                SsCoverEdit::Remove => CoverEdit::Remove,
                SsCoverEdit::Set => CoverEdit::Set(unsafe { arg_str(e.cover_path, "cover_path")? }.into()),
            },
        };
        let version = match e.version {
            SsTagVersion::Id3v24 => TagVersion::V24,
            SsTagVersion::Id3v23 => TagVersion::V23,
        };
        l.write_tags(&names, &edit, version)
    })
    .map_or_else(|status| status, |()| SsStatus::Ok)
}

/// The settings as JSON (see core/crates/core/src/settings.rs):
/// `{"recordingsDir": string|null, "quality": "cbr128"|"cbr192"|"cbr256"|
/// "cbr320"|"vbr0"|"vbr2", "id3Version": "2.4"|"2.3", "lastSource":
/// null|{"kind":"system"}|{"kind":"app","id":string|null,"name":string}}`,
/// plus `"effectiveRecordingsDir"`. Free with `ss_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn ss_settings_get() -> *mut c_char {
    let s = settings::load();
    let mut json = serde_json::to_value(&s).unwrap_or_default();
    json["effectiveRecordingsDir"] = serde_json::Value::String(s.recordings_dir().to_string_lossy().into_owned());
    c_string(&json.to_string()).into_raw()
}

/// Validates and saves settings JSON (unknown keys are ignored; missing
/// keys take defaults). Call `ss_library_apply_settings` afterwards.
///
/// # Safety
/// `json` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_settings_set(json: *const c_char) -> SsStatus {
    let result = (|| -> Result<(), String> {
        let text = unsafe { arg_str(json, "json")? };
        let parsed: settings::Settings = serde_json::from_str(text).map_err(|e| format!("invalid settings: {e}"))?;
        settings::save(&parsed)
    })();
    result.map_or_else(fail, |()| SsStatus::Ok)
}

/// Points the library at the recordings folder from the saved settings.
///
/// # Safety
/// `library` must be a live handle from `ss_library_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_library_apply_settings(library: *mut SsLibrary) -> SsStatus {
    with_library(library, |l| l.set_dir(settings::load().recordings_dir())).map_or_else(|status| status, |()| SsStatus::Ok)
}

/// Opaque visualizer handle: draws the recorder's live analysis. Create
/// with `ss_vis_create`, free with `ss_vis_destroy`. One per view; use it
/// from one thread at a time.
pub struct SsVis {
    hub: Arc<sound_scraper_vis::VisHub>,
    renderer: sound_scraper_vis::render::Renderer,
}

/// Creates a visualizer for `recorder`'s audio, drawing the default preset.
/// It stays valid after the recorder is destroyed (it then shows the idle
/// look). NULL if `recorder` is NULL.
///
/// # Safety
/// `recorder` must be NULL or a live handle from `ss_recorder_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_vis_create(recorder: *const SsRecorder) -> *mut SsVis {
    let Some(r) = (unsafe { recorder.as_ref() }) else { return ptr::null_mut() };
    Box::into_raw(Box::new(SsVis { hub: r.status.vis(), renderer: Default::default() }))
}

/// Sets the preset: one entry of a resolved skin's `visualizer.presets`, as
/// JSON (`{"style": "bars"|"scope"|"mirror"|"radial"|"fire", "bands",
/// "color", "gradient", "peak", "gap", "lineWidth", "background", "grid",
/// "line", "decay", "beat"}`; colors as #hex).
///
/// # Safety
/// `vis` must be a live handle; `json` NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_vis_set_preset(vis: *mut SsVis, json: *const c_char) -> SsStatus {
    let Some(v) = (unsafe { vis.as_mut() }) else { return fail("vis is NULL") };
    let result = unsafe { arg_str(json, "json") }.and_then(sound_scraper_vis::render::Preset::from_json);
    match result {
        Ok(preset) => {
            v.renderer.set_preset(preset);
            SsStatus::Ok
        }
        Err(e) => fail(e),
    }
}

/// Draws the latest frame, or the idle look when nothing is recording, into
/// `rgba`: premultiplied RGBA, `width` × `height` pixels, `len` bytes (at
/// least width × height × 4), with `unit` pixels per skin point. Returns
/// true while a recording is live (keep redrawing), false when idle (the
/// idle look needs drawing only once) or on bad arguments.
///
/// # Safety
/// `vis` must be a live handle; `rgba` must point to `len` writable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_vis_render(
    vis: *mut SsVis,
    width: u32,
    height: u32,
    unit: f32,
    rgba: *mut u8,
    len: usize,
) -> bool {
    let Some(v) = (unsafe { vis.as_mut() }) else { return false };
    let needed = width as usize * height as usize * 4;
    if rgba.is_null() || width == 0 || height == 0 || len < needed {
        return false;
    }
    let buf = unsafe { std::slice::from_raw_parts_mut(rgba, needed) };
    let SsVis { hub, renderer } = v;
    catch_unwind(AssertUnwindSafe(|| {
        let live = hub.with_latest(|frame| renderer.render(Some(frame), width, height, unit, buf));
        if live.is_none() {
            renderer.render(None, width, height, unit, buf);
        }
        live.is_some()
    }))
    .unwrap_or(false)
}

/// Whether a recording is live (active or paused), so frames change. Cheap;
/// lets a view skip redrawing the idle look.
///
/// # Safety
/// `vis` must be NULL or a live handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_vis_is_live(vis: *const SsVis) -> bool {
    unsafe { vis.as_ref() }.is_some_and(|v| v.hub.is_active())
}

/// Destroys a visualizer. NULL is a no-op.
///
/// # Safety
/// `vis` must be NULL or a handle from `ss_vis_create` not yet destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_vis_destroy(vis: *mut SsVis) {
    if !vis.is_null() {
        drop(unsafe { Box::from_raw(vis) });
    }
}

/// Opaque window drag or resize in progress (see core/crates/layout). Free
/// with `ss_layout_gesture_end`.
pub enum SsLayoutGesture {
    Drag(sound_scraper_layout::Drag),
    Resize(sound_scraper_layout::Resize),
}

fn parse_scene(json: *const c_char) -> Result<sound_scraper_layout::Scene, String> {
    let text = unsafe { arg_str(json, "scene_json")? };
    serde_json::from_str(text).map_err(|e| format!("invalid layout scene: {e}"))
}

/// Starts dragging panel `id`. `scene_json` is `{"panels": [{"id", "x",
/// "y", "w", "h", "visible"}], "screens": [{"x", "y", "w", "h"}]}` in
/// global points, origin top left, y down; screens are work areas. Dragging
/// "main" moves its docked chain; other panels move alone. NULL on failure.
///
/// # Safety
/// `scene_json` and `id` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_drag_begin(scene_json: *const c_char, id: *const c_char) -> *mut SsLayoutGesture {
    let result = (|| {
        let scene = parse_scene(scene_json)?;
        sound_scraper_layout::Drag::begin(scene, unsafe { arg_str(id, "id")? })
    })();
    match result {
        Ok(drag) => Box::into_raw(Box::new(SsLayoutGesture::Drag(drag))),
        Err(e) => {
            fail(e);
            ptr::null_mut()
        }
    }
}

/// Starts resizing panel `id` by its right and bottom edges, no smaller than
/// `min_w` × `min_h`. Panels docked on those edges stay attached. NULL on
/// failure.
///
/// # Safety
/// As for `ss_layout_drag_begin`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_resize_begin(
    scene_json: *const c_char,
    id: *const c_char,
    min_w: f64,
    min_h: f64,
) -> *mut SsLayoutGesture {
    let result = (|| {
        let scene = parse_scene(scene_json)?;
        sound_scraper_layout::Resize::begin(scene, unsafe { arg_str(id, "id")? }, min_w, min_h)
    })();
    match result {
        Ok(resize) => Box::into_raw(Box::new(SsLayoutGesture::Resize(resize))),
        Err(e) => {
            fail(e);
            ptr::null_mut()
        }
    }
}

/// New frames for the pointer moved by (dx, dy) points since the gesture
/// began (for a resize: the size change), as a JSON array of `{"id", "x",
/// "y", "w", "h"}`. `snap` false (Option held) skips snapping. Free with
/// `ss_string_free`; NULL if `gesture` is NULL.
///
/// # Safety
/// `gesture` must be NULL or live.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_gesture_update(gesture: *const SsLayoutGesture, dx: f64, dy: f64, snap: bool) -> *mut c_char {
    let Some(g) = (unsafe { gesture.as_ref() }) else { return ptr::null_mut() };
    let placements = match g {
        SsLayoutGesture::Drag(d) => d.update(dx, dy, snap),
        SsLayoutGesture::Resize(r) => r.update(dx, dy, snap),
    };
    json_or_null(Ok(placements))
}

/// Ends a gesture. NULL is a no-op.
///
/// # Safety
/// `gesture` must be NULL or a live handle not yet ended.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_gesture_end(gesture: *mut SsLayoutGesture) {
    if !gesture.is_null() {
        drop(unsafe { Box::from_raw(gesture) });
    }
}

/// For a scene (as in `ss_layout_drag_begin`): `{"docked": [ids docked to
/// main], "constrain": [placements pulling off-screen panels back], "tidy":
/// [placements straightening docked panels]}`. Free
/// with `ss_string_free`; NULL on failure.
///
/// # Safety
/// `scene_json` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_analyze(scene_json: *const c_char) -> *mut c_char {
    json_or_null(parse_scene(scene_json).map(|scene| {
        serde_json::json!({ "docked": scene.docked_to_main(), "constrain": scene.constrain(), "tidy": scene.tidy() })
    }))
}

/// New frames for a double-size change by `ratio` (2 or 0.5): the main
/// panel's docked group keeps its shape around the main panel's top-left
/// corner; other panels grow or shrink in place. JSON array of placements;
/// free with `ss_string_free`; NULL on failure.
///
/// # Safety
/// `scene_json` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_scale(scene_json: *const c_char, ratio: f64) -> *mut c_char {
    json_or_null(parse_scene(scene_json).map(|scene| scene.scale(ratio)))
}

/// Where to open panel `id`, given its remembered or default frame (x, y,
/// w, h): that frame if it covers no open panel, else docked at the next
/// free edge of the main panel's group, on a screen. JSON `{"x", "y", "w",
/// "h"}`; free with `ss_string_free`; NULL on failure.
///
/// # Safety
/// `scene_json` and `id` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_place(
    scene_json: *const c_char,
    id: *const c_char,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> *mut c_char {
    let result = (|| {
        let scene = parse_scene(scene_json)?;
        let id = unsafe { arg_str(id, "id")? };
        Ok(scene.place(id, sound_scraper_layout::Rect::new(x, y, w, h)))
    })();
    json_or_null(result)
}

fn layout_path() -> std::path::PathBuf {
    crate::paths::app_data_dir().join("layout.json")
}

/// The saved layout, `{"version", "panels": [{"id", "x", "y", "w", "h",
/// "visible"}]}`, or "null" when none was saved. Free with `ss_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn ss_layout_load() -> *mut c_char {
    json_or_null(Ok(sound_scraper_layout::load_from(&layout_path())))
}

/// Saves the layout (same JSON as `ss_layout_load` returns).
///
/// # Safety
/// `json` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_layout_save(json: *const c_char) -> SsStatus {
    let result = (|| {
        let text = unsafe { arg_str(json, "json")? };
        let layout: sound_scraper_layout::SavedLayout =
            serde_json::from_str(text).map_err(|e| format!("invalid layout: {e}"))?;
        sound_scraper_layout::save_to(&layout_path(), &layout)
    })();
    result.map_or_else(fail, |()| SsStatus::Ok)
}

/// Serializes a skin result as JSON for the UI, or records the error and
/// returns NULL.
fn json_or_null<T: serde::Serialize>(result: Result<T, String>) -> *mut c_char {
    match result.and_then(|v| serde_json::to_string(&v).map_err(|e| e.to_string())) {
        Ok(json) => c_string(&json).into_raw(),
        Err(e) => {
            fail(e);
            ptr::null_mut()
        }
    }
}

fn catch<T>(what: &str, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(f)).unwrap_or_else(|_| Err(format!("{what} failed unexpectedly")))
}

/// Resolves a skin for the UI as JSON (see core/crates/skin/src/resolve.rs,
/// `ResolvedSkin`): image paths are absolute, `@token` colors resolved, and
/// what the skin leaves out comes from the Default skin. `id_or_path` is an
/// installed skin's id, an absolute path to an unpacked skin folder, or
/// NULL/"" for the Default skin. NULL on failure (see
/// `ss_last_error_message`). Free with `ss_string_free`.
///
/// # Safety
/// `id_or_path` must be NULL or NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_load(id_or_path: *const c_char) -> *mut c_char {
    let arg = if id_or_path.is_null() { Ok(None) } else { unsafe { arg_str(id_or_path, "id_or_path") }.map(Some) };
    json_or_null(catch("loading the skin", || skins::load(&skins::store(), arg?)))
}

/// The skin chosen in the settings (`"skin"`), resolved as by
/// `ss_skin_load`. If it no longer loads, the Default skin is returned with
/// the reason first in `warnings`. Free with `ss_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn ss_skin_load_current() -> *mut c_char {
    json_or_null(catch("loading the skin", || skins::load_current(&skins::store())))
}

/// Validates a `.sskin` archive and installs it into the Skins folder
/// (replacing a skin with the same id). Returns the installed skin's summary
/// as JSON (`{"id", "name", "author", "version", "dir", "builtin", "error"}`),
/// or NULL on failure with a message naming the file and problem. Free with
/// `ss_string_free`.
///
/// # Safety
/// `archive_path` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_install(archive_path: *const c_char) -> *mut c_char {
    let path = unsafe { arg_str(archive_path, "archive_path") };
    json_or_null(catch("installing the skin", || skins::store().install(std::path::Path::new(path?))))
}

/// Installed skins as a JSON array of summaries (see `ss_skin_install`),
/// the Default skin first. Free with `ss_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn ss_skins_list() -> *mut c_char {
    json_or_null(catch("listing skins", || Ok(skins::store().list())))
}

/// Uninstalls a skin by id. The Default skin can't be removed.
///
/// # Safety
/// `id` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_remove(id: *const c_char) -> SsStatus {
    let result = catch("removing the skin", || skins::store().remove(unsafe { arg_str(id, "id")? }));
    result.map_or_else(fail, |()| SsStatus::Ok)
}

/// Validates a `.sskin` archive without installing it, for the install
/// card: `{"id", "name", "author", "version", "description", "path",
/// "preview" (a PNG of the main panel, or null), "warnings", "installed"
/// (the installed skin it would replace, or null)}`. NULL on failure. Free
/// with `ss_string_free`.
///
/// # Safety
/// `archive_path` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_inspect(archive_path: *const c_char) -> *mut c_char {
    let path = unsafe { arg_str(archive_path, "archive_path") };
    json_or_null(catch("reading the skin", || skins::store().inspect(std::path::Path::new(path?))))
}

/// A picture of a skin's main panel with sample content: the path of a
/// cached PNG, as a JSON string. `id_or_path` as for `ss_skin_load`. Free
/// with `ss_string_free`.
///
/// # Safety
/// `id_or_path` must be NULL or NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_preview(id_or_path: *const c_char) -> *mut c_char {
    let arg = if id_or_path.is_null() { Ok(None) } else { unsafe { arg_str(id_or_path, "id_or_path") }.map(Some) };
    json_or_null(catch("drawing the skin", || {
        let store = skins::store();
        let skin = skins::load(&store, arg?)?;
        store.preview(&skin)
    }))
}

/// Checks an unpacked skin folder and writes it as a `.sskin` to
/// `out_path`. Returns the skin's summary (see `ss_skin_install`; `dir` is
/// the archive), or NULL with the problem. Free with `ss_string_free`.
///
/// # Safety
/// Both arguments must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_package(dir: *const c_char, out_path: *const c_char) -> *mut c_char {
    let (dir, out) = unsafe { (arg_str(dir, "dir"), arg_str(out_path, "out_path")) };
    json_or_null(catch("packaging the skin", || {
        skins::store().package(std::path::Path::new(dir?), std::path::Path::new(out?))
    }))
}

/// Creates a new skin folder `parent/name` from the Default skin (with its
/// own id and a README guide) for a skin author. Returns its path as a
/// JSON string, or NULL. Free with `ss_string_free`.
///
/// # Safety
/// Both arguments must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_create(parent: *const c_char, name: *const c_char) -> *mut c_char {
    let (parent, name) = unsafe { (arg_str(parent, "parent"), arg_str(name, "name")) };
    json_or_null(catch("creating the skin", || skins::store().create_from_template(std::path::Path::new(parent?), name?)))
}

/// A token (JSON string) that changes whenever a skin folder's files do,
/// for reloading a skin while it's being made. NULL if the folder can't be
/// read. Free with `ss_string_free`.
///
/// # Safety
/// `dir` must be NUL-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_skin_folder_stamp(dir: *const c_char) -> *mut c_char {
    let dir = unsafe { arg_str(dir, "dir") };
    json_or_null(catch("reading the skin folder", || skins::folder_stamp(std::path::Path::new(dir?))))
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
    fn vis_draws_the_idle_look_without_a_recording() {
        let r = ss_recorder_create();
        let vis = unsafe { ss_vis_create(r) };
        assert!(!vis.is_null());
        let preset = c"{\"style\":\"bars\",\"line\":\"#00ff00\"}";
        assert_eq!(unsafe { ss_vis_set_preset(vis, preset.as_ptr()) }, SsStatus::Ok);
        assert_eq!(unsafe { ss_vis_set_preset(vis, c"{\"style\":\"lasers\"}".as_ptr()) }, SsStatus::Error);
        let mut buf = vec![0u8; 16 * 8 * 4];
        assert!(!unsafe { ss_vis_render(vis, 16, 8, 1.0, buf.as_mut_ptr(), buf.len()) });
        assert!(buf.chunks_exact(4).any(|p| p == [0, 255, 0, 255]), "idle line drawn");
        assert!(!unsafe { ss_vis_render(vis, 16, 8, 1.0, buf.as_mut_ptr(), 10) });
        unsafe { ss_recorder_destroy(r) };
        // Still usable after the recorder is gone.
        assert!(!unsafe { ss_vis_render(vis, 16, 8, 1.0, buf.as_mut_ptr(), buf.len()) });
        unsafe { ss_vis_destroy(vis) };
        assert!(unsafe { ss_vis_create(ptr::null()) }.is_null());
    }

    #[test]
    fn layout_gestures() {
        let scene = c"{\"panels\":[{\"id\":\"main\",\"x\":0,\"y\":0,\"w\":100,\"h\":50},{\"id\":\"library\",\"x\":0,\"y\":50,\"w\":100,\"h\":80}],\"screens\":[]}";
        let drag = unsafe { ss_layout_drag_begin(scene.as_ptr(), c"main".as_ptr()) };
        assert!(!drag.is_null());
        let out = unsafe { ss_layout_gesture_update(drag, 10.0, 5.0, true) };
        let text = unsafe { CStr::from_ptr(out) }.to_str().unwrap().to_owned();
        unsafe { ss_string_free(out) };
        unsafe { ss_layout_gesture_end(drag) };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v[1]["id"], "library");
        assert_eq!(v[1]["y"], 55.0);
        let analysis = unsafe { ss_layout_analyze(scene.as_ptr()) };
        let text = unsafe { CStr::from_ptr(analysis) }.to_str().unwrap().to_owned();
        unsafe { ss_string_free(analysis) };
        assert!(text.contains("\"docked\":[\"library\"]"), "{text}");
        assert!(unsafe { ss_layout_drag_begin(c"{".as_ptr(), c"main".as_ptr()) }.is_null());
        assert!(unsafe { ss_layout_resize_begin(scene.as_ptr(), c"nope".as_ptr(), 1.0, 1.0) }.is_null());
    }

    #[test]
    fn skin_calls_report_errors() {
        let json = unsafe { ss_skin_load(c"com.example.not-installed".as_ptr()) };
        assert!(json.is_null());
        let message = unsafe { CStr::from_ptr(ss_last_error_message()) };
        assert!(message.to_str().unwrap().contains("not installed"));
        assert_eq!(unsafe { ss_skin_remove(c"com.alexboyce.soundscraper.default".as_ptr()) }, SsStatus::Error);
        assert!(unsafe { ss_skin_install(ptr::null()) }.is_null());
    }

    #[test]
    fn app_list_handles_null() {
        assert_eq!(unsafe { ss_audio_app_list_len(ptr::null()) }, 0);
        assert!(unsafe { ss_audio_app_list_get(ptr::null(), 0) }.is_null());
        unsafe { ss_audio_app_list_free(ptr::null_mut()) };
    }
}

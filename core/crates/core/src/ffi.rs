//! C ABI consumed by the native modules (Objective-C++ on macOS,
//! C++/WinRT on Windows). cbindgen turns this file into
//! `core/include/sound_scraper.h`.
//!
//! Rules: opaque handles and plain `#[repr(C)]` types only, every function
//! is `ss_`-prefixed, and nothing here panics across the boundary.

use std::ffi::c_char;

use crate::recorder::{Recorder, RecorderState};

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
}

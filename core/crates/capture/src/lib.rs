//! Platform audio capture behind [`CaptureBackend`] (see docs/design.md §2).
//!
//! - Windows: WASAPI loopback, process loopback for single apps ([`windows`]).
//! - macOS: Core Audio process taps, ScreenCaptureKit fallback ([`macos`]).
//! - Linux: PipeWire (later).

use std::{fmt, sync::mpsc::SyncSender};

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

/// Stable identifier for an output device.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DeviceId(pub String);

#[derive(Debug, Clone)]
pub struct OutputDevice {
    pub id: DeviceId,
    pub name: String,
    pub is_default: bool,
}

/// An app that can be captured on its own.
#[derive(Debug, Clone)]
pub struct AppTarget {
    pub pid: u32,
    pub bundle_id: Option<String>,
    pub name: String,
    pub icon: Option<Vec<u8>>,
    /// Producing sound right now (sorted to the top of the picker).
    pub is_playing: bool,
}

/// What to record: everything the computer plays, or one app.
#[derive(Debug, Clone)]
pub enum CaptureSource {
    System { device: Option<DeviceId> },
    App { app: AppTarget },
}

/// Interleaved f32 PCM.
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// A running capture, returned by [`CaptureBackend::start`].
#[derive(Debug)]
pub struct Session {
    pub id: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CaptureError {
    /// This OS (or OS version) can't capture the requested source.
    Unsupported(&'static str),
    /// The user hasn't granted the capture permission.
    PermissionDenied,
    NotImplemented,
    Os(String),
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported(why) => write!(f, "unsupported: {why}"),
            Self::PermissionDenied => f.write_str(
                "audio capture permission denied (macOS: System Settings › Privacy & Security › \
                 Screen & System Audio Recording)",
            ),
            Self::NotImplemented => f.write_str("not implemented"),
            Self::Os(msg) => write!(f, "OS error: {msg}"),
        }
    }
}

impl std::error::Error for CaptureError {}

pub trait CaptureBackend: Send {
    /// Output devices, for the device picker.
    fn list_outputs(&self) -> Vec<OutputDevice>;
    /// Running apps, with the ones playing sound first, for the app picker.
    fn list_audio_apps(&self) -> Vec<AppTarget>;
    /// Starts delivering audio to `sink`. Backends use `try_send` so a full
    /// queue drops audio instead of blocking the real-time thread. Stopping
    /// the session drops the sender, which disconnects the receiver.
    fn start(&mut self, source: CaptureSource, sink: SyncSender<AudioChunk>) -> Result<Session, CaptureError>;
    fn stop(&mut self, session: Session);
}

/// The capture backend for the OS this was built for.
pub fn default_backend() -> Box<dyn CaptureBackend> {
    #[cfg(target_os = "macos")]
    return Box::new(macos::MacCapture::new());
    #[cfg(target_os = "windows")]
    return Box::new(windows::WasapiCapture::new());
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Box::new(Unsupported);
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
struct Unsupported;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl CaptureBackend for Unsupported {
    fn list_outputs(&self) -> Vec<OutputDevice> {
        Vec::new()
    }
    fn list_audio_apps(&self) -> Vec<AppTarget> {
        Vec::new()
    }
    fn start(&mut self, _: CaptureSource, _: SyncSender<AudioChunk>) -> Result<Session, CaptureError> {
        Err(CaptureError::Unsupported("no capture backend for this OS yet"))
    }
    fn stop(&mut self, _: Session) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capturing_a_missing_app_fails() {
        let (tx, _rx) = std::sync::mpsc::sync_channel(1);
        let mut backend = default_backend();
        let app = AppTarget { pid: u32::MAX, bundle_id: None, name: "nobody".into(), icon: None, is_playing: false };
        assert!(backend.start(CaptureSource::App { app }, tx).is_err());
    }
}

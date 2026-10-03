//! macOS capture: Core Audio process taps (14.2+) with a ScreenCaptureKit
//! fallback (13.0+). Stub until milestone 1.

use std::sync::mpsc::Sender;

use crate::{AppTarget, AudioChunk, CaptureBackend, CaptureError, CaptureSource, OutputDevice, Session};

#[derive(Debug, Default)]
pub struct MacCapture;

impl MacCapture {
    pub fn new() -> Self {
        Self
    }
}

impl CaptureBackend for MacCapture {
    fn list_outputs(&self) -> Vec<OutputDevice> {
        Vec::new()
    }

    fn list_audio_apps(&self) -> Vec<AppTarget> {
        Vec::new()
    }

    fn start(&mut self, _source: CaptureSource, _sink: Sender<AudioChunk>) -> Result<Session, CaptureError> {
        Err(CaptureError::NotImplemented)
    }

    fn stop(&mut self, _session: Session) {}
}

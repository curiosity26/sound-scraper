//! SMTC (Windows.Media.Control). TODO(windows agent): implement.

use std::sync::mpsc::Sender;

use crate::{BackendEvent, NowPlayingBackend, NowPlayingError, PlayerId};

pub struct Smtc;

impl Smtc {
    pub fn new() -> Self {
        Self
    }
}

impl NowPlayingBackend for Smtc {
    fn start(&mut self, _: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        Err(NowPlayingError::Unavailable(
            "SMTC backend not implemented yet".into(),
        ))
    }
    fn stop(&mut self) {}
    fn owns(&self, _: &PlayerId, _: u32, _: Option<&str>) -> bool {
        false
    }
}

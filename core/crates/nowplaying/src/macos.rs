//! MediaRemote via mediaremote-adapter, AppleScript fallback. TODO(later): implement.

use std::sync::mpsc::Sender;

use crate::{BackendEvent, NowPlayingBackend, NowPlayingError, PlayerId};

pub struct MediaRemote;

impl MediaRemote {
    pub fn new() -> Self {
        Self
    }
}

impl NowPlayingBackend for MediaRemote {
    fn start(&mut self, _: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        Err(NowPlayingError::Unavailable(
            "MediaRemote backend not implemented yet".into(),
        ))
    }
    fn stop(&mut self) {}
    fn owns(&self, _: &PlayerId, _: u32, _: Option<&str>) -> bool {
        false
    }
}

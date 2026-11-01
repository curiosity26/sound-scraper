//! MPRIS over D-Bus. TODO(linux agent): implement.

use std::sync::mpsc::Sender;

use crate::{BackendEvent, NowPlayingBackend, NowPlayingError, PlayerId};

pub struct Mpris;

impl Mpris {
    pub fn new() -> Self {
        Self
    }
}

impl NowPlayingBackend for Mpris {
    fn start(&mut self, _: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        Err(NowPlayingError::Unavailable(
            "MPRIS backend not implemented yet".into(),
        ))
    }
    fn stop(&mut self) {}
    fn owns(&self, _: &PlayerId, _: u32, _: Option<&str>) -> bool {
        false
    }
}

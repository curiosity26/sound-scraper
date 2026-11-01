//! Backends for tests and for OSes without a now-playing service.

use std::sync::{Arc, Mutex, mpsc::Sender};

use crate::{BackendEvent, NowPlayingBackend, NowPlayingError, PlayerId};

/// Reports nothing.
pub struct Unavailable;

impl NowPlayingBackend for Unavailable {
    fn start(&mut self, _: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        Err(NowPlayingError::Unavailable(
            "not supported on this OS".into(),
        ))
    }
    fn stop(&mut self) {}
    fn owns(&self, _: &PlayerId, _: u32, _: Option<&str>) -> bool {
        false
    }
}

/// A backend a test drives by hand: clone the [`FakeHandle`] before giving
/// the backend away, then `send` events through it.
#[derive(Default)]
pub struct FakeBackend {
    handle: FakeHandle,
}

#[derive(Clone, Default)]
pub struct FakeHandle {
    sink: Arc<Mutex<Option<Sender<BackendEvent>>>>,
}

impl FakeHandle {
    /// Delivers `event` if the backend is started; returns whether it was.
    pub fn send(&self, event: BackendEvent) -> bool {
        match &*self.sink.lock().unwrap() {
            Some(sink) => sink.send(event).is_ok(),
            None => false,
        }
    }
}

impl FakeBackend {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn handle(&self) -> FakeHandle {
        self.handle.clone()
    }
}

impl NowPlayingBackend for FakeBackend {
    fn start(&mut self, sink: Sender<BackendEvent>) -> Result<(), NowPlayingError> {
        *self.handle.sink.lock().unwrap() = Some(sink);
        Ok(())
    }
    fn stop(&mut self) {
        *self.handle.sink.lock().unwrap() = None;
    }
    /// The fake's players are owned by the pid in their `PlayerId`.
    fn owns(&self, player: &PlayerId, pid: u32, _: Option<&str>) -> bool {
        player.pid == Some(pid)
    }
}

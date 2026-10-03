//! Recorder state machine (see docs/design.md §3). Stub: holds state only.

/// Recording state, exposed to C as `SsRecorderState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecorderState {
    Idle,
    Recording,
    Paused,
    Finalizing,
}

#[derive(Debug)]
pub struct Recorder {
    state: RecorderState,
}

impl Recorder {
    pub fn new() -> Self {
        Self { state: RecorderState::Idle }
    }

    pub fn state(&self) -> RecorderState {
        self.state
    }
}

impl Default for Recorder {
    fn default() -> Self {
        Self::new()
    }
}

//! Sound Scraper core. All app logic lives here; the UI reaches it only
//! through the C ABI in [`ffi`].

pub mod capture_test;
pub mod ffi;
pub mod mp3;
pub mod paths;
pub mod recorder;
pub mod sources;

pub use recorder::{Recorder, RecorderEvent, RecorderState};

/// Core library version (the crate version).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

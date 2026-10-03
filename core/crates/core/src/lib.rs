//! Sound Scraper core. All app logic lives here; the UI reaches it only
//! through the C ABI in [`ffi`].

pub mod ffi;
pub mod recorder;

pub use recorder::{Recorder, RecorderState};

/// Core library version (the crate version).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

//! Sound Scraper core. All app logic lives here; the UI reaches it only
//! through the C ABI in [`ffi`].

pub mod capture_test;
pub mod edit;
pub mod ffi;
pub mod library;
pub mod masters;
pub mod mp3;
pub mod paths;
pub mod player;
pub mod playlists;
pub mod recorder;
pub mod settings;
pub mod skins;
pub mod sources;
pub mod tags;
pub mod trim;

pub use recorder::{Recorder, RecorderEvent, RecorderState};

/// Core library version (the crate version).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

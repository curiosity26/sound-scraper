//! The track editor's core (docs/track-editor-design.md): waveform peaks,
//! the edit list, lossless MP3 cutting and saving tracks.

pub mod mp3cut;
pub mod edits;
pub mod save;
pub mod editor;
pub mod peaks;
pub mod detect;

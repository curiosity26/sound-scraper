//! Mapping the UI's source choice (an app PID or "all system audio") to a
//! capture source.

use sound_scraper_capture::{AppTarget, CaptureSource, default_backend};

/// Running apps with audio, for the source picker.
pub fn audio_apps() -> Vec<AppTarget> {
    default_backend().list_audio_apps()
}

/// `None` = all system audio; `Some(pid)` = that app.
pub fn source_for_pid(app_pid: Option<u32>) -> CaptureSource {
    match app_pid {
        None => CaptureSource::System { device: None },
        Some(pid) => CaptureSource::App {
            app: audio_apps()
                .into_iter()
                .find(|a| a.pid == pid)
                .unwrap_or(AppTarget {
                    pid,
                    bundle_id: None,
                    name: format!("pid {pid}"),
                    icon: None,
                    is_playing: false,
                }),
        },
    }
}

/// Human-readable source name used in file names and tags.
pub fn source_label(source: &CaptureSource) -> String {
    match source {
        CaptureSource::System { .. } => "System audio".to_string(),
        CaptureSource::App { app } => app.name.clone(),
    }
}

//! Windows diagnostic: every active output device and its audio sessions.
//!   cargo run -p sound_scraper_capture --example audio_sessions

#[cfg(target_os = "windows")]
fn main() {
    use wasapi::{DeviceEnumerator, Direction, initialize_mta};
    let _ = initialize_mta();
    let enumerator = DeviceEnumerator::new().expect("device enumerator");
    let default = enumerator.get_default_device(&Direction::Render).and_then(|d| d.get_id()).unwrap_or_default();
    let devices = enumerator.get_device_collection(&Direction::Render).expect("render devices");
    for device in &devices {
        let Ok(device) = device else { continue };
        let id = device.get_id().unwrap_or_default();
        println!(
            "device: {} ({:?}){}",
            device.get_friendlyname().unwrap_or_default(),
            device.get_state(),
            if id == default { "  [default]" } else { "" }
        );
        let Ok(manager) = device.get_iaudiosessionmanager() else { continue };
        let Ok(sessions) = manager.get_audiosessionenumerator() else { continue };
        for i in 0..sessions.get_count().unwrap_or(0) {
            let Ok(s) = sessions.get_session(i) else { continue };
            println!(
                "  pid {:>6}  {:?}  {}",
                s.get_process_id().unwrap_or(0),
                s.get_state(),
                s.get_session_identifier().unwrap_or_default()
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("Windows only");
}

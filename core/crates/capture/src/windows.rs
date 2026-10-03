//! Windows capture through WASAPI (docs/design.md §2).
//!
//! - All system audio: shared-mode loopback on the default render device.
//! - One app: process loopback (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`)
//!   including the target's child processes, which needs Windows 10 build
//!   20348 or later.
//!
//! Loopback delivers no packets while nothing plays, so the capture thread
//! inserts silence after a gap to keep the recording's timeline correct.

use std::{
    collections::{HashMap, VecDeque},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use wasapi::{AudioClient, DeviceEnumerator, Direction, SampleType, SessionState, StreamMode, WaveFormat, initialize_mta};

use crate::{AppTarget, AudioChunk, CaptureBackend, CaptureError, CaptureSource, OutputDevice, Session};

/// Process loopback capture arrived in Windows 10 build 20348.
const PROCESS_LOOPBACK_MIN_BUILD: u32 = 20348;
/// Insert silence once no audio has arrived for this long.
const SILENCE_GAP: Duration = Duration::from_millis(100);

#[derive(Debug, Default)]
pub struct WasapiCapture {
    next_id: u64,
    running: HashMap<u64, Running>,
}

impl WasapiCapture {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CaptureBackend for WasapiCapture {
    fn list_outputs(&self) -> Vec<OutputDevice> {
        Vec::new()
    }

    fn list_audio_apps(&self) -> Vec<AppTarget> {
        audio_apps().unwrap_or_default()
    }

    fn start(&mut self, source: CaptureSource, sink: SyncSender<AudioChunk>) -> Result<Session, CaptureError> {
        if let CaptureSource::App { app } = &source {
            if windows_build() < PROCESS_LOOPBACK_MIN_BUILD {
                return Err(CaptureError::Unsupported(
                    "recording a single app needs Windows 10 build 20348 or later (Windows 11)",
                ));
            }
            // Process loopback accepts any PID and then records silence.
            if !process_table().contains_key(&app.pid) {
                return Err(CaptureError::Os(format!("{} is no longer running", app.name)));
            }
        }
        let stop = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = mpsc::channel();
        let thread_stop = stop.clone();
        let thread = std::thread::Builder::new()
            .name("sound-scraper-wasapi".into())
            .spawn(move || capture_thread(source, sink, thread_stop, ready_tx))
            .map_err(|e| CaptureError::Os(e.to_string()))?;
        let running = Running { stop, thread: Some(thread) };
        match ready_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => {
                self.next_id += 1;
                self.running.insert(self.next_id, running);
                Ok(Session { id: self.next_id })
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err(CaptureError::Os("timed out starting WASAPI capture".into())),
        }
    }

    fn stop(&mut self, session: Session) {
        drop(self.running.remove(&session.id));
    }
}

#[derive(Debug)]
struct Running {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn os_err(e: impl std::fmt::Display) -> CaptureError {
    CaptureError::Os(e.to_string())
}

/// Owns the WASAPI client for one recording. Reports setup success or
/// failure through `ready`, then streams until `stop` is set. Returning drops
/// `sink`, which tells the consumer the capture ended.
fn capture_thread(
    source: CaptureSource,
    sink: SyncSender<AudioChunk>,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Result<(), CaptureError>>,
) {
    let _ = initialize_mta(); // RPC_E_CHANGED_MODE is fine: COM is usable either way
    let setup = || -> Result<(AudioClient, u32, u16, bool), CaptureError> {
        match &source {
            CaptureSource::System { .. } => {
                let device = DeviceEnumerator::new().map_err(os_err)?.get_default_device(&Direction::Render).map_err(os_err)?;
                let mut client = device.get_iaudioclient().map_err(os_err)?;
                let mix = client.get_mixformat().map_err(os_err)?;
                let (rate, channels) = (mix.get_samplespersec(), mix.get_nchannels());
                let format = WaveFormat::new(32, 32, &SampleType::Float, rate as usize, channels as usize, None);
                // Event-driven loopback is unreliable on older systems; poll.
                let mode = StreamMode::PollingShared { autoconvert: true, buffer_duration_hns: 2_000_000 };
                client.initialize_client(&format, &Direction::Capture, &mode).map_err(os_err)?;
                Ok((client, rate, channels, false))
            }
            CaptureSource::App { app } => {
                let mut client = AudioClient::new_application_loopback_client(app.pid, true).map_err(os_err)?;
                // Process loopback has no mix format; ask for 48 kHz stereo float.
                let format = WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
                let mode = StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: 0 };
                client.initialize_client(&format, &Direction::Capture, &mode).map_err(os_err)?;
                Ok((client, 48000, 2, true))
            }
        }
    };
    let (client, rate, channels, event_driven) = match setup() {
        Ok(v) => v,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    let start = || -> Result<_, CaptureError> {
        let capture = client.get_audiocaptureclient().map_err(os_err)?;
        let event = if event_driven { Some(client.set_get_eventhandle().map_err(os_err)?) } else { None };
        client.start_stream().map_err(os_err)?;
        Ok((capture, event))
    };
    let (capture, event) = match start() {
        Ok(v) => v,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    let _ = ready.send(Ok(()));

    let frame_bytes = 4 * channels as usize;
    let mut bytes: VecDeque<u8> = VecDeque::new();
    let started = Instant::now();
    let mut last_audio = started;
    let mut frames_sent: u64 = 0;
    while !stop.load(Ordering::Acquire) {
        match &event {
            Some(handle) => {
                let _ = handle.wait_for_event(100);
            }
            None => std::thread::sleep(Duration::from_millis(10)),
        }
        // Drain every queued packet; zero the ones flagged silent.
        loop {
            match capture.get_next_packet_size() {
                Ok(Some(n)) if n > 0 => {
                    let before = bytes.len();
                    match capture.read_from_device_to_deque(&mut bytes) {
                        Ok(info) if info.flags.silent => {
                            for b in bytes.range_mut(before..) {
                                *b = 0;
                            }
                        }
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }
                _ => break,
            }
        }

        let frames = bytes.len() / frame_bytes;
        if frames > 0 {
            last_audio = Instant::now();
            let raw: Vec<u8> = bytes.drain(..frames * frame_bytes).collect();
            let samples: Vec<f32> = raw.as_chunks::<4>().0.iter().map(|b| f32::from_le_bytes(*b)).collect();
            frames_sent += frames as u64;
            let _ = sink.try_send(AudioChunk { samples, sample_rate: rate, channels });
        } else if last_audio.elapsed() >= SILENCE_GAP {
            // Nothing is playing: fill up to wall-clock time with silence.
            let expected = (started.elapsed().as_secs_f64() * f64::from(rate)) as u64;
            let missing = expected.saturating_sub(frames_sent);
            if missing > 0 {
                frames_sent += missing;
                last_audio = Instant::now();
                let samples = vec![0.0; missing as usize * channels as usize];
                let _ = sink.try_send(AudioChunk { samples, sample_rate: rate, channels });
            }
        }
    }
    let _ = client.stop_stream();
}

/// Apps with audio sessions on the default output, playing ones first.
fn audio_apps() -> Result<Vec<AppTarget>, CaptureError> {
    let _ = initialize_mta();
    let device = DeviceEnumerator::new().map_err(os_err)?.get_default_device(&Direction::Render).map_err(os_err)?;
    let sessions = device.get_iaudiosessionmanager().map_err(os_err)?.get_audiosessionenumerator().map_err(os_err)?;
    let processes = process_table();
    let mut apps: Vec<AppTarget> = Vec::new();
    for i in 0..sessions.get_count().map_err(os_err)? {
        let Ok(session) = sessions.get_session(i) else { continue };
        let Ok(pid) = session.get_process_id() else { continue };
        if pid == 0 {
            continue; // system sounds
        }
        let playing = matches!(session.get_state(), Ok(SessionState::Active));
        let root = root_process(pid, &processes);
        if let Some(existing) = apps.iter_mut().find(|a| a.pid == root) {
            existing.is_playing |= playing;
            continue;
        }
        let exe = processes.get(&root).map(|p| p.exe.clone()).unwrap_or_default();
        let path = image_path(root);
        apps.push(AppTarget {
            pid: root,
            name: display_name(&exe, pid),
            bundle_id: path.or(if exe.is_empty() { None } else { Some(exe) }),
            icon: None,
            is_playing: playing,
        });
    }
    apps.sort_by(|a, b| b.is_playing.cmp(&a.is_playing).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(apps)
}

struct ProcessInfo {
    parent: u32,
    exe: String,
}

fn process_table() -> HashMap<u32, ProcessInfo> {
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
        },
    };
    let mut table = HashMap::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return table };
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snapshot, &mut entry).is_ok();
        while ok {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            table.insert(entry.th32ProcessID, ProcessInfo {
                parent: entry.th32ParentProcessID,
                exe: String::from_utf16_lossy(&entry.szExeFile[..len]),
            });
            ok = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
    }
    table
}

/// Walks up while the parent runs the same executable, so a browser's audio
/// helper maps to the browser itself (whose process tree we then capture).
fn root_process(pid: u32, table: &HashMap<u32, ProcessInfo>) -> u32 {
    let mut current = pid;
    for _ in 0..32 {
        let Some(me) = table.get(&current) else { break };
        match table.get(&me.parent) {
            Some(parent) if me.parent != current && parent.exe.eq_ignore_ascii_case(&me.exe) => current = me.parent,
            _ => break,
        }
    }
    current
}

fn image_path(pid: u32) -> Option<String> {
    use windows::{
        Win32::{
            Foundation::CloseHandle,
            System::Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW},
        },
        core::PWSTR,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let result = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        result.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// "spotify.exe" → "Spotify".
fn display_name(exe: &str, pid: u32) -> String {
    let stem = Path::new(exe).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut chars = stem.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => format!("pid {pid}"),
    }
}

fn windows_build() -> u32 {
    use windows::{Wdk::System::SystemServices::RtlGetVersion, Win32::System::SystemInformation::OSVERSIONINFOW};
    let mut info = OSVERSIONINFOW { dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32, ..Default::default() };
    if unsafe { RtlGetVersion(&mut info) }.is_ok() { info.dwBuildNumber } else { 0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names_and_roots() {
        assert_eq!(display_name("spotify.exe", 1), "Spotify");
        assert_eq!(display_name("", 7), "pid 7");
        let mut t = HashMap::new();
        t.insert(10, ProcessInfo { parent: 1, exe: "explorer.exe".into() });
        t.insert(20, ProcessInfo { parent: 10, exe: "chrome.exe".into() });
        t.insert(21, ProcessInfo { parent: 20, exe: "chrome.exe".into() });
        t.insert(22, ProcessInfo { parent: 21, exe: "Chrome.exe".into() });
        assert_eq!(root_process(22, &t), 20);
        assert_eq!(root_process(10, &t), 10);
    }

    #[test]
    fn this_windows_is_new_enough_or_reports_its_build() {
        assert!(windows_build() > 0);
    }
}

//! macOS capture through Core Audio process taps (macOS 14.2+).
//!
//! A tap (`CATapDescription`) selects what to record: a global stereo tap for
//! all system audio, or a stereo mixdown of one app's audio processes. The tap
//! is wrapped in a private aggregate device whose IO proc delivers the tapped
//! audio as f32 PCM. The ScreenCaptureKit fallback for macOS 13–14.1 is not
//! implemented yet.

use std::{
    collections::HashMap,
    ffi::{CStr, c_void},
    mem::{MaybeUninit, size_of},
    ptr::{self, NonNull},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::SyncSender,
    },
    time::{Duration, Instant},
};

use objc2::{AnyThread, rc::Retained};
use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication};
use objc2_core_audio::{
    AudioDeviceCreateIOProcID, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
    AudioDeviceStop, AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap,
    AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID,
    AudioObjectPropertyAddress, AudioObjectPropertySelector, CATapDescription, CATapMuteBehavior,
    kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceIsStackedKey,
    kAudioAggregateDeviceMainSubDeviceKey, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceSubDeviceListKey, kAudioAggregateDeviceTapAutoStartKey,
    kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey, kAudioDevicePropertyDeviceUID,
    kAudioHardwarePropertyDefaultSystemOutputDevice, kAudioHardwarePropertyProcessObjectList,
    kAudioHardwarePropertyTranslatePIDToProcessObject, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, kAudioProcessPropertyBundleID,
    kAudioProcessPropertyIsRunningOutput, kAudioProcessPropertyPID, kAudioSubDeviceUIDKey,
    kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
};
use objc2_core_audio_types::{
    AudioBuffer, AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp,
    kAudioFormatFlagIsFloat,
};
use objc2_core_foundation::{CFDictionary, CFRetained, CFString};
use objc2_foundation::{NSArray, NSCopying, NSDictionary, NSNumber, NSObject, NSString, NSUUID};

use crate::{
    AppTarget, AudioChunk, CaptureBackend, CaptureError, CaptureSource, OutputDevice, Session,
};

const SYSTEM_OBJECT: AudioObjectID = kAudioObjectSystemObject as AudioObjectID;

#[derive(Default)]
pub struct MacCapture {
    next_id: u64,
    running: HashMap<u64, Running>,
}

impl MacCapture {
    pub fn new() -> Self {
        Self::default()
    }
}

impl std::fmt::Debug for MacCapture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacCapture")
            .field("running", &self.running.len())
            .finish()
    }
}

impl CaptureBackend for MacCapture {
    fn list_outputs(&self) -> Vec<OutputDevice> {
        Vec::new()
    }

    fn list_audio_apps(&self) -> Vec<AppTarget> {
        audio_apps().unwrap_or_default()
    }

    fn start(
        &mut self,
        source: CaptureSource,
        sink: SyncSender<AudioChunk>,
    ) -> Result<Session, CaptureError> {
        let running = unsafe { Running::start(&source, sink)? };
        self.next_id += 1;
        self.running.insert(self.next_id, running);
        Ok(Session { id: self.next_id })
    }

    fn stop(&mut self, session: Session) {
        if let Some(running) = self.running.remove(&session.id) {
            drop(running);
        }
    }
}

/// "System Audio Recording" permission (TCC service kTCCServiceAudioCapture).
///
/// There is no public API to query or request it, so this uses the TCC
/// framework the same way other tap-based recorders do. If the framework or
/// its symbols are missing, it assumes access and lets capture proceed.
mod permission {
    use std::{
        ffi::{CStr, c_char, c_int, c_void},
        sync::{OnceLock, mpsc},
        time::Duration,
    };

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_core_foundation::CFString;

    type Preflight = unsafe extern "C" fn(*const CFString, *const c_void) -> c_int;
    type Request =
        unsafe extern "C" fn(*const CFString, *const c_void, *const block2::Block<dyn Fn(Bool)>);

    struct Tcc {
        preflight: Preflight,
        request: Request,
    }

    fn tcc() -> Option<&'static Tcc> {
        static TCC: OnceLock<Option<Tcc>> = OnceLock::new();
        TCC.get_or_init(|| unsafe {
            let path = c"/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC";
            let handle = libc::dlopen(path.as_ptr(), libc::RTLD_NOW);
            if handle.is_null() {
                return None;
            }
            let sym = |name: &CStr| libc::dlsym(handle, name.as_ptr() as *const c_char);
            let (preflight, request) = (sym(c"TCCAccessPreflight"), sym(c"TCCAccessRequest"));
            if preflight.is_null() || request.is_null() {
                return None;
            }
            Some(Tcc {
                preflight: std::mem::transmute::<*mut c_void, Preflight>(preflight),
                request: std::mem::transmute::<*mut c_void, Request>(request),
            })
        })
        .as_ref()
    }

    /// True when capture is allowed, prompting the user if they haven't
    /// decided yet. Blocks until they answer; call off the main thread.
    pub fn ensure_audio_capture() -> bool {
        let Some(tcc) = tcc() else { return true };
        let service = CFString::from_static_str("kTCCServiceAudioCapture");
        match unsafe { (tcc.preflight)(&*service, std::ptr::null()) } {
            0 => true,
            1 => false,
            _ => {
                let (tx, rx) = mpsc::channel();
                let done = RcBlock::new(move |granted: Bool| {
                    let _ = tx.send(granted.as_bool());
                });
                unsafe { (tcc.request)(&*service, std::ptr::null(), &*done) };
                rx.recv_timeout(Duration::from_secs(120)).unwrap_or(false)
            }
        }
    }
}

/// Apps that currently have audio processes, those playing sound first.
fn audio_apps() -> Result<Vec<AppTarget>, CaptureError> {
    let procs = unsafe { audio_processes()? };
    let mut apps: Vec<AppTarget> = Vec::new();
    let mut helpers = Vec::new();

    for p in &procs {
        let running = NSRunningApplication::runningApplicationWithProcessIdentifier(p.pid);
        let regular = running
            .as_ref()
            .is_some_and(|a| a.activationPolicy() == NSApplicationActivationPolicy::Regular);
        if regular {
            let name = running
                .as_ref()
                .and_then(|a| a.localizedName())
                .map(|n| n.to_string());
            apps.push(AppTarget {
                pid: p.pid as u32,
                name: name
                    .or_else(|| p.bundle_id.clone())
                    .unwrap_or_else(|| format!("pid {}", p.pid)),
                bundle_id: p.bundle_id.clone(),
                icon: None,
                is_playing: p.running_output,
            });
        } else {
            helpers.push(p);
        }
    }

    // Helper processes (browser renderers etc.) count towards their app.
    for h in helpers {
        if let Some(app) = apps.iter_mut().find(|app| is_helper_of(h, app)) {
            app.is_playing |= h.running_output;
        }
    }

    apps.sort_by(|a, b| {
        b.is_playing
            .cmp(&a.is_playing)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(apps)
}

struct AudioProcess {
    object: AudioObjectID,
    pid: i32,
    bundle_id: Option<String>,
    running_output: bool,
}

fn is_helper_of(p: &AudioProcess, app: &AppTarget) -> bool {
    match (&p.bundle_id, &app.bundle_id) {
        (Some(helper), Some(bundle)) => helper.starts_with(&format!("{bundle}.")),
        _ => false,
    }
}

/// Owns one tap + aggregate device + IO proc + silence watchdog. Dropping it
/// tears them down.
struct Running {
    tap: AudioObjectID,
    aggregate: AudioObjectID,
    io_proc: AudioDeviceIOProcID,
    /// The IO proc's client data (one strong count of `IoContext`).
    ctx: *const IoContext,
    watchdog: Option<(Arc<AtomicBool>, std::thread::JoinHandle<()>)>,
}

// The raw handles are only touched from start/drop, never shared.
unsafe impl Send for Running {}

/// Shared by the IO proc (real-time thread) and the silence watchdog.
struct IoContext {
    sink: SyncSender<AudioChunk>,
    sample_rate: u32,
    channels: u16,
    started: Instant,
    frames_sent: AtomicU64,
    /// Nanoseconds after `started` when audio (or fill) was last sent.
    last_sent_ns: AtomicU64,
}

/// A tap delivers nothing while nothing is playing (the aggregate device
/// idles), so after this long without audio the watchdog inserts silence up
/// to wall-clock time, keeping quiet stretches in the recording.
const SILENCE_GAP: Duration = Duration::from_millis(100);

impl IoContext {
    fn mark_sent(&self, frames: u64) {
        self.frames_sent.fetch_add(frames, Ordering::AcqRel);
        self.last_sent_ns
            .store(self.started.elapsed().as_nanos() as u64, Ordering::Release);
    }

    /// Called by the watchdog: fills the gap if the tap has been quiet.
    fn fill_silence(&self) {
        let now = self.started.elapsed();
        let last = Duration::from_nanos(self.last_sent_ns.load(Ordering::Acquire));
        if now.saturating_sub(last) < SILENCE_GAP {
            return;
        }
        let expected = (now.as_secs_f64() * f64::from(self.sample_rate)) as u64;
        let missing = expected.saturating_sub(self.frames_sent.load(Ordering::Acquire));
        if missing == 0 {
            return;
        }
        self.mark_sent(missing);
        let samples = vec![0.0; missing as usize * self.channels as usize];
        let _ = self.sink.try_send(AudioChunk {
            samples,
            sample_rate: self.sample_rate,
            channels: self.channels,
        });
    }
}

impl Running {
    unsafe fn start(
        source: &CaptureSource,
        sink: SyncSender<AudioChunk>,
    ) -> Result<Self, CaptureError> {
        // Without the permission the tap is created but never delivers audio,
        // so ask up front (this shows the system prompt the first time).
        if !permission::ensure_audio_capture() {
            return Err(CaptureError::PermissionDenied);
        }
        let desc = unsafe { tap_description(source)? };
        unsafe {
            desc.setUUID(&NSUUID::new());
            desc.setName(&NSString::from_str("Sound Scraper"));
            desc.setPrivate(true);
            desc.setMuteBehavior(CATapMuteBehavior::Unmuted);
        }

        let mut tap: AudioObjectID = 0;
        check(
            unsafe { AudioHardwareCreateProcessTap(Some(&desc), &mut tap) },
            "creating the process tap",
        )?;
        let mut running = Running {
            tap,
            aggregate: 0,
            io_proc: None,
            ctx: ptr::null(),
            watchdog: None,
        };

        let format: AudioStreamBasicDescription =
            unsafe { get_property(tap, kAudioTapPropertyFormat, None)? };
        if format.mFormatFlags & kAudioFormatFlagIsFloat == 0 || format.mBitsPerChannel != 32 {
            return Err(CaptureError::Os(format!(
                "unexpected tap format (flags {:#x}, {} bits)",
                format.mFormatFlags, format.mBitsPerChannel
            )));
        }

        let output: AudioObjectID = unsafe {
            get_property(
                SYSTEM_OBJECT,
                kAudioHardwarePropertyDefaultSystemOutputDevice,
                None,
            )?
        };
        let output_uid = unsafe { get_string(output, kAudioDevicePropertyDeviceUID)? };
        let tap_uid = unsafe { desc.UUID() }.UUIDString();
        let aggregate_desc = aggregate_description(&output_uid, &tap_uid);
        let cf_desc: &CFDictionary =
            unsafe { &*(Retained::as_ptr(&aggregate_desc) as *const CFDictionary) };
        check(
            unsafe {
                AudioHardwareCreateAggregateDevice(cf_desc, NonNull::from(&mut running.aggregate))
            },
            "creating the aggregate device",
        )?;

        let ctx = Arc::new(IoContext {
            sink,
            sample_rate: format.mSampleRate as u32,
            channels: format.mChannelsPerFrame.max(1) as u16,
            started: Instant::now(),
            frames_sent: AtomicU64::new(0),
            last_sent_ns: AtomicU64::new(0),
        });
        running.ctx = Arc::into_raw(ctx.clone());
        check(
            unsafe {
                AudioDeviceCreateIOProcID(
                    running.aggregate,
                    Some(io_proc),
                    running.ctx.cast_mut().cast(),
                    NonNull::from(&mut running.io_proc),
                )
            },
            "creating the IO proc",
        )?;
        check(
            unsafe { AudioDeviceStart(running.aggregate, running.io_proc) },
            "starting the aggregate device",
        )?;

        let stop = Arc::new(AtomicBool::new(false));
        let watchdog_stop = stop.clone();
        let watchdog = std::thread::Builder::new()
            .name("sound-scraper-silence".into())
            .spawn(move || {
                while !watchdog_stop.load(Ordering::Acquire) {
                    std::thread::sleep(Duration::from_millis(20));
                    ctx.fill_silence();
                }
            })
            .map_err(|e| CaptureError::Os(e.to_string()))?;
        running.watchdog = Some((stop, watchdog));
        Ok(running)
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        if let Some((stop, thread)) = self.watchdog.take() {
            stop.store(true, Ordering::Release);
            let _ = thread.join();
        }
        unsafe {
            if self.aggregate != 0 {
                if self.io_proc.is_some() {
                    AudioDeviceStop(self.aggregate, self.io_proc);
                    AudioDeviceDestroyIOProcID(self.aggregate, self.io_proc);
                }
                AudioHardwareDestroyAggregateDevice(self.aggregate);
            }
            if self.tap != 0 {
                AudioHardwareDestroyProcessTap(self.tap);
            }
            if !self.ctx.is_null() {
                drop(Arc::from_raw(self.ctx));
            }
        }
    }
}

unsafe fn tap_description(
    source: &CaptureSource,
) -> Result<Retained<CATapDescription>, CaptureError> {
    match source {
        CaptureSource::System { .. } => Ok(unsafe {
            CATapDescription::initStereoGlobalTapButExcludeProcesses(
                CATapDescription::alloc(),
                &NSArray::new(),
            )
        }),
        CaptureSource::App { app } => {
            let objects = unsafe { app_process_objects(app)? };
            if objects.is_empty() {
                return Err(CaptureError::Os(format!(
                    "{} has no audio processes right now",
                    app.name
                )));
            }
            let numbers: Vec<Retained<NSNumber>> =
                objects.iter().map(|&o| NSNumber::new_u32(o)).collect();
            Ok(unsafe {
                CATapDescription::initStereoMixdownOfProcesses(
                    CATapDescription::alloc(),
                    &NSArray::from_retained_slice(&numbers),
                )
            })
        }
    }
}

/// The app's own audio process plus helpers whose bundle ID extends the app's.
unsafe fn app_process_objects(app: &AppTarget) -> Result<Vec<AudioObjectID>, CaptureError> {
    let mut objects: Vec<AudioObjectID> = unsafe { audio_processes()? }
        .iter()
        .filter(|p| p.pid as u32 == app.pid || is_helper_of(p, app))
        .map(|p| p.object)
        .collect();
    if objects.is_empty() {
        let pid = app.pid as i32;
        let pid_bytes = pid.to_ne_bytes();
        let object: AudioObjectID = unsafe {
            get_property(
                SYSTEM_OBJECT,
                kAudioHardwarePropertyTranslatePIDToProcessObject,
                Some(&pid_bytes),
            )?
        };
        if object != 0 {
            objects.push(object);
        }
    }
    Ok(objects)
}

unsafe fn audio_processes() -> Result<Vec<AudioProcess>, CaptureError> {
    let objects =
        unsafe { get_object_list(SYSTEM_OBJECT, kAudioHardwarePropertyProcessObjectList)? };
    Ok(objects
        .into_iter()
        .filter_map(|object| {
            let pid: i32 = unsafe { get_property(object, kAudioProcessPropertyPID, None).ok()? };
            let running: u32 = unsafe {
                get_property(object, kAudioProcessPropertyIsRunningOutput, None).unwrap_or(0)
            };
            let bundle_id = unsafe { get_string(object, kAudioProcessPropertyBundleID).ok() }
                .filter(|b| !b.is_empty());
            Some(AudioProcess {
                object,
                pid,
                bundle_id,
                running_output: running != 0,
            })
        })
        .collect())
}

fn aggregate_description(
    output_uid: &str,
    tap_uid: &NSString,
) -> Retained<NSDictionary<NSString, NSObject>> {
    fn key(k: &CStr) -> Retained<NSString> {
        NSString::from_str(k.to_str().unwrap())
    }
    fn obj<T: objc2::Message>(v: Retained<T>) -> Retained<NSObject> {
        // Every value here is an NSObject subclass.
        unsafe { Retained::cast_unchecked(v) }
    }
    fn dict(pairs: &[(&CStr, Retained<NSObject>)]) -> Retained<NSDictionary<NSString, NSObject>> {
        let keys: Vec<Retained<NSString>> = pairs.iter().map(|(k, _)| key(k)).collect();
        let key_refs: Vec<&NSString> = keys.iter().map(|k| &**k).collect();
        let values: Vec<Retained<NSObject>> = pairs.iter().map(|(_, v)| v.clone()).collect();
        NSDictionary::from_retained_objects(&key_refs, &values)
    }

    let output_uid = NSString::from_str(output_uid);
    let sub_device = dict(&[(kAudioSubDeviceUIDKey, obj(output_uid.clone()))]);
    let sub_tap = dict(&[
        (kAudioSubTapUIDKey, obj(tap_uid.copy())),
        (
            kAudioSubTapDriftCompensationKey,
            obj(NSNumber::new_bool(true)),
        ),
    ]);
    dict(&[
        (
            kAudioAggregateDeviceNameKey,
            obj(NSString::from_str("Sound Scraper Tap")),
        ),
        (kAudioAggregateDeviceUIDKey, obj(NSUUID::new().UUIDString())),
        (kAudioAggregateDeviceMainSubDeviceKey, obj(output_uid)),
        (
            kAudioAggregateDeviceIsPrivateKey,
            obj(NSNumber::new_bool(true)),
        ),
        (
            kAudioAggregateDeviceIsStackedKey,
            obj(NSNumber::new_bool(false)),
        ),
        (
            kAudioAggregateDeviceTapAutoStartKey,
            obj(NSNumber::new_bool(true)),
        ),
        (
            kAudioAggregateDeviceSubDeviceListKey,
            obj(NSArray::from_retained_slice(&[sub_device])),
        ),
        (
            kAudioAggregateDeviceTapListKey,
            obj(NSArray::from_retained_slice(&[sub_tap])),
        ),
    ])
}

/// Real-time IO callback: copies the tapped audio out as interleaved f32.
unsafe extern "C-unwind" fn io_proc(
    _device: AudioObjectID,
    _now: NonNull<AudioTimeStamp>,
    input: NonNull<AudioBufferList>,
    _input_time: NonNull<AudioTimeStamp>,
    _output: NonNull<AudioBufferList>,
    _output_time: NonNull<AudioTimeStamp>,
    client: *mut c_void,
) -> i32 {
    let ctx = unsafe { &*(client as *const IoContext) };
    let list = unsafe { input.as_ref() };
    let buffers: &[AudioBuffer] =
        unsafe { std::slice::from_raw_parts(list.mBuffers.as_ptr(), list.mNumberBuffers as usize) };
    let as_f32 = |b: &AudioBuffer| -> &[f32] {
        if b.mData.is_null() {
            &[]
        } else {
            unsafe {
                std::slice::from_raw_parts(b.mData as *const f32, b.mDataByteSize as usize / 4)
            }
        }
    };

    let (samples, channels) = match buffers {
        [] => return 0,
        [single] => (
            as_f32(single).to_vec(),
            single.mNumberChannels.max(1) as u16,
        ),
        planes => {
            // Non-interleaved: one mono buffer per channel.
            let planes: Vec<&[f32]> = planes.iter().map(as_f32).collect();
            let frames = planes.iter().map(|p| p.len()).min().unwrap_or(0);
            let mut out = Vec::with_capacity(frames * planes.len());
            for f in 0..frames {
                out.extend(planes.iter().map(|p| p[f]));
            }
            (out, planes.len() as u16)
        }
    };
    ctx.mark_sent((samples.len() / channels.max(1) as usize) as u64);
    // A full queue means the consumer is behind; drop rather than block.
    let _ = ctx.sink.try_send(AudioChunk {
        samples,
        sample_rate: ctx.sample_rate,
        channels,
    });
    0
}

fn address(selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    }
}

unsafe fn get_property<T: Copy>(
    object: AudioObjectID,
    selector: AudioObjectPropertySelector,
    qualifier: Option<&[u8]>,
) -> Result<T, CaptureError> {
    let mut addr = address(selector);
    let mut size = size_of::<T>() as u32;
    let mut out = MaybeUninit::<T>::uninit();
    let (q_size, q_ptr) =
        qualifier.map_or((0, ptr::null()), |q| (q.len() as u32, q.as_ptr().cast()));
    check(
        unsafe {
            AudioObjectGetPropertyData(
                object,
                NonNull::from(&mut addr),
                q_size,
                q_ptr,
                NonNull::from(&mut size),
                NonNull::new_unchecked(out.as_mut_ptr().cast()),
            )
        },
        "reading an audio property",
    )?;
    Ok(unsafe { out.assume_init() })
}

unsafe fn get_object_list(
    object: AudioObjectID,
    selector: AudioObjectPropertySelector,
) -> Result<Vec<AudioObjectID>, CaptureError> {
    let mut addr = address(selector);
    let mut size = 0u32;
    check(
        unsafe {
            AudioObjectGetPropertyDataSize(
                object,
                NonNull::from(&mut addr),
                0,
                ptr::null(),
                NonNull::from(&mut size),
            )
        },
        "sizing an audio object list",
    )?;
    let mut list = vec![0 as AudioObjectID; size as usize / size_of::<AudioObjectID>()];
    if list.is_empty() {
        return Ok(list);
    }
    check(
        unsafe {
            AudioObjectGetPropertyData(
                object,
                NonNull::from(&mut addr),
                0,
                ptr::null(),
                NonNull::from(&mut size),
                NonNull::new_unchecked(list.as_mut_ptr().cast()),
            )
        },
        "reading an audio object list",
    )?;
    list.truncate(size as usize / size_of::<AudioObjectID>());
    Ok(list)
}

unsafe fn get_string(
    object: AudioObjectID,
    selector: AudioObjectPropertySelector,
) -> Result<String, CaptureError> {
    let raw: *const CFString = unsafe { get_property(object, selector, None)? };
    let string = NonNull::new(raw as *mut CFString)
        .map(|p| unsafe { CFRetained::from_raw(p) })
        .ok_or_else(|| CaptureError::Os("audio property returned no string".into()))?;
    Ok(string.to_string())
}

fn check(status: i32, what: &str) -> Result<(), CaptureError> {
    if status == 0 {
        return Ok(());
    }
    let code = status.to_be_bytes();
    let detail = if code.iter().all(|c| c.is_ascii_graphic()) {
        format!("'{}'", String::from_utf8_lossy(&code))
    } else {
        status.to_string()
    };
    Err(CaptureError::Os(format!(
        "{what} failed (OSStatus {detail})"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(started: Instant) -> (IoContext, std::sync::mpsc::Receiver<AudioChunk>) {
        let (tx, rx) = std::sync::mpsc::sync_channel(8);
        let ctx = IoContext {
            sink: tx,
            sample_rate: 48000,
            channels: 2,
            started,
            frames_sent: AtomicU64::new(0),
            last_sent_ns: AtomicU64::new(0),
        };
        (ctx, rx)
    }

    #[test]
    fn fills_quiet_stretches_up_to_wall_clock_time() {
        let (ctx, rx) = context(Instant::now() - Duration::from_millis(500));
        ctx.fill_silence();
        let chunk = rx.try_recv().expect("a silence chunk");
        let frames = chunk.samples.len() / 2;
        assert!(
            (23_500..=25_500).contains(&frames),
            "about 0.5 s of frames, got {frames}"
        );
        assert!(chunk.samples.iter().all(|&s| s == 0.0));
        // Just filled: no second chunk until another gap opens.
        ctx.fill_silence();
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn leaves_flowing_audio_alone() {
        let (ctx, rx) = context(Instant::now() - Duration::from_millis(500));
        ctx.mark_sent(24_000); // the IO proc just delivered audio
        ctx.fill_silence();
        assert!(rx.try_recv().is_err());
    }
}

//! The end-to-end tests' audio tool (app/e2e): writes the test tone a test
//! plays, and checks what a recording the app made actually captured.
//!
//! ```text
//! sound-scraper-probe tone OUT.wav HZ SECONDS
//! sound-scraper-probe analyze RECORDING.mp3 HZ
//! ```
//!
//! `tone` writes a 48 kHz stereo sine at -6 dBFS with short fades.
//! `analyze` decodes the recording and prints JSON:
//!
//! - `durationMs`: the decoded length.
//! - `rmsDbfs`: the level over the whole file.
//! - `audibleMs`: how much of it is louder than -40 dBFS, in 100 ms windows.
//! - `toneRatio`: the share of the audible windows' energy at HZ (1 for a
//!   clean sine at HZ, near 0 for silence or something else).

use std::{f64::consts::PI, fs::File, path::Path, process::ExitCode};

use symphonia::core::{
    audio::SampleBuffer,
    codecs::{CODEC_TYPE_NULL, DecoderOptions},
    errors::Error as SymphoniaError,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

const TONE_RATE: u32 = 48_000;
const TONE_LEVEL: f64 = 0.5;
const FADE_SECS: f64 = 0.02;
const AUDIBLE_DBFS: f64 = -40.0;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>()[..] {
        ["tone", out, hz, secs] => number(hz)
            .and_then(|hz| Ok((hz, number(secs)?)))
            .and_then(|(hz, secs)| tone(Path::new(out), hz, secs)),
        ["analyze", file, hz] => number(hz).and_then(|hz| analyze(Path::new(file), hz)),
        _ => Err(
            "usage: sound-scraper-probe tone OUT.wav HZ SECONDS\n       \
                  sound-scraper-probe analyze RECORDING.mp3 HZ"
                .into(),
        ),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("sound-scraper-probe: {e}");
            ExitCode::FAILURE
        }
    }
}

fn number(s: &str) -> Result<f64, String> {
    s.parse().map_err(|_| format!("{s} isn't a number"))
}

fn tone(out: &Path, hz: f64, secs: f64) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: TONE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut wav = hound::WavWriter::create(out, spec).map_err(|e| e.to_string())?;
    let frames = (secs * f64::from(TONE_RATE)) as usize;
    let fade = FADE_SECS * f64::from(TONE_RATE);
    for i in 0..frames {
        let t = i as f64 / f64::from(TONE_RATE);
        let envelope = (i as f64 / fade).min((frames - i) as f64 / fade).min(1.0);
        let v = (2.0 * PI * hz * t).sin() * TONE_LEVEL * envelope;
        let sample = (v * f64::from(i16::MAX)) as i16;
        for _ in 0..2 {
            wav.write_sample(sample).map_err(|e| e.to_string())?;
        }
    }
    wav.finalize().map_err(|e| e.to_string())
}

fn analyze(file: &Path, hz: f64) -> Result<(), String> {
    let (samples, rate) = decode_mono(file)?;
    let window = (rate / 10) as usize;
    let (mut total, mut audible_energy, mut at_hz) = (0.0, 0.0, 0.0);
    let mut audible_windows = 0;
    for chunk in samples.chunks(window) {
        let energy: f64 = chunk.iter().map(|&s| f64::from(s).powi(2)).sum();
        total += energy;
        if chunk.len() < window || dbfs(energy / chunk.len() as f64) < AUDIBLE_DBFS {
            continue;
        }
        audible_windows += 1;
        audible_energy += energy;
        at_hz += goertzel_energy(chunk, hz, f64::from(rate));
    }
    let report = serde_json::json!({
        "durationMs": samples.len() as u64 * 1000 / u64::from(rate),
        "sampleRate": rate,
        "rmsDbfs": dbfs(total / samples.len().max(1) as f64),
        "audibleMs": audible_windows * 100,
        "toneRatio": if audible_energy > 0.0 { at_hz / audible_energy } else { 0.0 },
    });
    println!("{report}");
    Ok(())
}

/// Level in dBFS of a mean square (a full-scale sine is -3); digital
/// silence is -200, since JSON has no infinity.
fn dbfs(mean_square: f64) -> f64 {
    (10.0 * mean_square.log10()).max(-200.0)
}

/// The energy of `chunk` at `hz`, scaled to compare with its total energy
/// (a sine at `hz` filling the window gives the same number).
fn goertzel_energy(chunk: &[f32], hz: f64, rate: f64) -> f64 {
    let coeff = 2.0 * (2.0 * PI * hz / rate).cos();
    let (mut s1, mut s2) = (0.0, 0.0);
    for &x in chunk {
        let s0 = f64::from(x) + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    let power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    2.0 * power / chunk.len() as f64
}

/// The file's audio, mixed to mono, and its sample rate.
fn decode_mono(file: &Path) -> Result<(Vec<f32>, u32), String> {
    let source = File::open(file).map_err(|e| format!("opening {}: {e}", file.display()))?;
    let stream = MediaSourceStream::new(Box::new(source), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = file.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions {
                enable_gapless: true,
                ..Default::default()
            },
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("{} isn't an MP3: {e}", file.display()))?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| format!("{} has no audio", file.display()))?;
    let track_id = track.id;
    let rate = track
        .codec_params
        .sample_rate
        .ok_or("unknown sample rate")?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;
    let mut mono = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(e.to_string()),
        };
        let channels = decoded.spec().channels.count();
        let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        buf.copy_interleaved_ref(decoded);
        mono.extend(
            buf.samples()
                .chunks(channels)
                .map(|frame| frame.iter().sum::<f32>() / channels as f32),
        );
    }
    Ok((mono, rate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(hz: f64, rate: f64, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| ((2.0 * PI * hz * i as f64 / rate).sin() * 0.5) as f32)
            .collect()
    }

    #[test]
    fn finds_all_of_a_sines_energy_at_its_frequency() {
        let chunk = sine(1000.0, 48_000.0, 4800);
        let energy: f64 = chunk.iter().map(|&s| f64::from(s).powi(2)).sum();
        let ratio = goertzel_energy(&chunk, 1000.0, 48_000.0) / energy;
        assert!((ratio - 1.0).abs() < 0.01, "{ratio}");
    }

    #[test]
    fn finds_almost_none_of_it_at_another_frequency() {
        let chunk = sine(440.0, 48_000.0, 4800);
        let energy: f64 = chunk.iter().map(|&s| f64::from(s).powi(2)).sum();
        let ratio = goertzel_energy(&chunk, 1000.0, 48_000.0) / energy;
        assert!(ratio < 0.01, "{ratio}");
    }
}

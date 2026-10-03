// Shared Turbo Module spec. Codegen turns this into the Objective-C++
// protocol (macOS) and the C++ spec header (Windows) that both native
// modules implement, which keeps the two platforms in sync.
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type AudioApp = {
  pid: number;
  name: string;
  bundleId: string | null;
  isPlaying: boolean;
};

export type CaptureReport = {
  path: string;
  frames: number;
  sampleRate: number;
  channels: number;
  /** Largest absolute sample; 0 means the recording was silent. */
  peak: number;
};

/** Mirrors SsRecorderEvent in sound_scraper.h. */
export type RecorderEvent = {
  /** 'state' | 'progress' | 'finished' | 'error' */
  kind: string;
  /** 'idle' | 'recording' | 'paused' | 'finalizing' */
  state: string;
  /** Recorded time, excluding pauses. */
  elapsedMs: number;
  /** Linear levels (0..1) over the last ~100 ms; 0 while paused. */
  peak: number;
  rms: number;
  path: string | null;
  message: string | null;
};

export interface Spec extends TurboModule {
  readonly onRecorderEvent: CodegenTypes.EventEmitter<RecorderEvent>;

  /** Rust core version, from `ss_version()` in sound_scraper.h. */
  getVersion(): string;
  /** Apps with audio processes, those playing sound first. */
  listAudioApps(): Array<AudioApp>;
  /** Records a test WAV: one app when appPid > 0, else all system audio. */
  recordTestWav(appPid: number, seconds: number): Promise<CaptureReport>;

  /** Starts recording one app (appPid > 0) or all system audio to MP3. */
  recorderStart(appPid: number): Promise<void>;
  recorderPause(): void;
  recorderResume(): void;
  /** Stops and finalizes; resolves with the .mp3 path. */
  recorderStop(): Promise<string>;
  /** 'idle' | 'recording' | 'paused' | 'finalizing' */
  recorderState(): string;
  /** Finishes recordings left by a crash; returns how many. */
  recoverPartialRecordings(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SoundScraper');

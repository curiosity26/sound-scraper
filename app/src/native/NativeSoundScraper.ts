// Shared Turbo Module spec. Codegen turns this into the Objective-C++
// protocol (macOS) and the C++ spec header (Windows) that both native
// modules implement, which keeps the two platforms in sync.
import type { TurboModule } from 'react-native';
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

export interface Spec extends TurboModule {
  /** Rust core version, from `ss_version()` in sound_scraper.h. */
  getVersion(): string;
  /** Apps with audio processes, those playing sound first. */
  listAudioApps(): Array<AudioApp>;
  /** Records a test WAV: one app when appPid > 0, else all system audio. */
  recordTestWav(appPid: number, seconds: number): Promise<CaptureReport>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SoundScraper');

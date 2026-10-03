import NativeSoundScraper from './NativeSoundScraper';
import type { AudioApp, CaptureReport } from './NativeSoundScraper';

export type { AudioApp, CaptureReport };

/** Version string reported by the Rust core through the native bridge. */
export function getCoreVersion(): string {
  return NativeSoundScraper.getVersion();
}

export function listAudioApps(): AudioApp[] {
  return NativeSoundScraper.listAudioApps();
}

/** Records `seconds` of audio to a WAV; `app` undefined means all system audio. */
export function recordTestWav(
  seconds: number,
  app?: AudioApp,
): Promise<CaptureReport> {
  return NativeSoundScraper.recordTestWav(app?.pid ?? 0, seconds);
}

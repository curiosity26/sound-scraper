import type { EventSubscription } from 'react-native';

import NativeSoundScraper from './NativeSoundScraper';
import type {
  AudioApp,
  CaptureReport,
  RecorderEvent,
} from './NativeSoundScraper';

export type { AudioApp, CaptureReport, RecorderEvent };

export type RecorderState = 'idle' | 'recording' | 'paused' | 'finalizing';

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

export const recorder = {
  /** Starts recording `app`, or all system audio when undefined. */
  start: (app?: AudioApp): Promise<void> =>
    NativeSoundScraper.recorderStart(app?.pid ?? 0),
  pause: (): void => NativeSoundScraper.recorderPause(),
  resume: (): void => NativeSoundScraper.recorderResume(),
  /** Stops and finalizes; resolves with the .mp3 path. */
  stop: (): Promise<string> => NativeSoundScraper.recorderStop(),
  state: (): RecorderState =>
    NativeSoundScraper.recorderState() as RecorderState,
  onEvent: (listener: (e: RecorderEvent) => void): EventSubscription =>
    NativeSoundScraper.onRecorderEvent(listener),
  /** Finishes recordings left by a crash; returns how many. */
  recoverPartials: (): number => NativeSoundScraper.recoverPartialRecordings(),
};

if (__DEV__) {
  // Lets the debugger console drive the same module instance as the UI.
  (globalThis as {__soundScraper?: unknown}).__soundScraper = {
    recorder,
    listAudioApps,
  };
}

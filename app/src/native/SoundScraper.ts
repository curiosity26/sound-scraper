import type { EventSubscription } from 'react-native';

import NativeSoundScraper from './NativeSoundScraper';
import type {
  AudioApp,
  CaptureReport,
  RecorderEvent,
  Recording,
  TagEdit,
  Tags,
} from './NativeSoundScraper';

export type {
  AudioApp,
  CaptureReport,
  RecorderEvent,
  Recording,
  TagEdit,
  Tags,
};

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

export const library = {
  /** Rescans the recordings folder; newest first. */
  list: (): Promise<Recording[]> => NativeSoundScraper.listRecordings(),
  /** Renames on disk; resolves with the new file name. */
  rename: (fileName: string, newName: string): Promise<string> =>
    NativeSoundScraper.renameRecording(fileName, newName),
  trash: (fileName: string): Promise<void> =>
    NativeSoundScraper.trashRecording(fileName),
  reveal: (fileName: string): void =>
    NativeSoundScraper.revealRecording(fileName),
  onChanged: (listener: () => void): EventSubscription =>
    NativeSoundScraper.onLibraryChanged(() => listener()),
  readTags: (fileName: string): Promise<Tags> =>
    NativeSoundScraper.readTags(fileName),
  writeTags: (fileNames: string[], edit: TagEdit): Promise<void> =>
    NativeSoundScraper.writeTags(fileNames, edit),
  /** Native open dialog for a cover image; null if cancelled. */
  pickImage: (): Promise<string | null> => NativeSoundScraper.pickImage(),
};

export type Quality =
  | 'cbr128'
  | 'cbr192'
  | 'cbr256'
  | 'cbr320'
  | 'vbr0'
  | 'vbr2';

export type SourceRef =
  | { kind: 'system' }
  | { kind: 'app'; id: string | null; name: string };

/** Mirrors core/crates/core/src/settings.rs. */
export type Settings = {
  /** Format version of the saved settings (managed by the core). */
  version?: number;
  /** null = the default ~/Music/Sound Scraper. */
  recordingsDir: string | null;
  quality: Quality;
  id3Version: '2.4' | '2.3';
  lastSource: SourceRef | null;
  /** Skin id or unpacked skin folder; null = the Default skin. */
  skin?: string | null;
  /** Draw the skinned main panel at twice its size. */
  doubleSize?: boolean;
};

export const settings = {
  get: (): Settings & { effectiveRecordingsDir: string } =>
    JSON.parse(NativeSoundScraper.getSettings()),
  /** Saves settings (validated by the core) and re-points the library. */
  set: (value: Settings): Promise<void> =>
    NativeSoundScraper.setSettings(
      JSON.stringify({
        version: value.version,
        recordingsDir: value.recordingsDir,
        quality: value.quality,
        id3Version: value.id3Version,
        lastSource: value.lastSource,
        skin: value.skin ?? null,
        doubleSize: value.doubleSize ?? false,
      }),
    ),
  pickFolder: (): Promise<string | null> => NativeSoundScraper.pickFolder(),
};

if (__DEV__) {
  // Lets the debugger console drive the same module instance as the UI.
  (globalThis as { __soundScraper?: unknown }).__soundScraper = {
    recorder,
    library,
    settings,
    listAudioApps,
  };
}

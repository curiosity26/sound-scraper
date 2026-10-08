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

export type PlayerState = 'empty' | 'stopped' | 'playing' | 'paused';

/** Playback of recordings; its events arrive through `recorder.onEvent`. */
export const player = {
  /** Loads a recording, stopped at the start. */
  load: (path: string): Promise<void> => NativeSoundScraper.playerLoad(path),
  unload: (): void => NativeSoundScraper.playerUnload(),
  play: (): Promise<void> => NativeSoundScraper.playerPlay(),
  pause: (): void => NativeSoundScraper.playerPause(),
  /** Stops and rewinds. */
  stop: (): void => NativeSoundScraper.playerStop(),
  seek: (positionMs: number): void => NativeSoundScraper.playerSeek(positionMs),
  state: (): PlayerState => NativeSoundScraper.playerState() as PlayerState,
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

export type Playlist = { id: number; name: string; count: number };
export type PlaylistItem = { id: number; fileName: string };

/** A playlists request (ss_playlists); throws the core's message on failure. */
function playlistsCall<T>(request: object): T {
  const answer = JSON.parse(
    NativeSoundScraper.playlists(JSON.stringify(request)),
  ) as { ok?: T; error?: string };
  if (answer.error !== undefined) {
    throw new Error(answer.error);
  }
  return answer.ok as T;
}

/** Playlists, kept by the core in their own database (playlists.rs). */
export const playlistsApi = {
  list: () => playlistsCall<Playlist[]>({ op: 'list' }),
  items: (id: number) => playlistsCall<PlaylistItem[]>({ op: 'items', id }),
  create: (name: string, fileNames: string[] = []) =>
    playlistsCall<Playlist>({ op: 'create', name, fileNames }),
  rename: (id: number, name: string) =>
    playlistsCall<Playlist>({ op: 'rename', id, name }),
  duplicate: (id: number) => playlistsCall<Playlist>({ op: 'duplicate', id }),
  delete: (id: number) => playlistsCall<null>({ op: 'delete', id }),
  add: (id: number, fileNames: string[]) =>
    playlistsCall<PlaylistItem[]>({ op: 'add', id, fileNames }),
  remove: (id: number, itemIds: number[]) =>
    playlistsCall<null>({ op: 'remove', id, itemIds }),
  setOrder: (id: number, itemIds: number[]) =>
    playlistsCall<null>({ op: 'setOrder', id, itemIds }),
  active: () => playlistsCall<number | null>({ op: 'active' }),
  setActive: (id: number | null) =>
    playlistsCall<null>({ op: 'setActive', id }),
  /** Writes an .m3u8; resolves with how many missing recordings were left out. */
  exportM3u8: (id: number, path: string) =>
    playlistsCall<{ missing: number }>({ op: 'exportM3u8', id, path }).missing,
};

/** Native Save dialog for one file type; null if cancelled. */
export function pickSaveFile(
  title: string,
  defaultName: string,
  extension: string,
): Promise<string | null> {
  return NativeSoundScraper.pickSaveFile(title, defaultName, extension);
}

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
  /** Drop silence before the first and after the last sound (default on). */
  trimSilence?: boolean;
  /** Record a lossless master for the track editor (default on). */
  keepMasters?: boolean;
  /** Recordings shorter than this drop their master (default 20). */
  masterMinMinutes?: number;
  /** Masters together stay under this (default 10). */
  masterBudgetGb?: number;
  /** Masters not edited for this long are removed (default 30). */
  masterMaxAgeDays?: number;
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
        trimSilence: value.trimSilence ?? true,
        keepMasters: value.keepMasters ?? true,
        masterMinMinutes: value.masterMinMinutes ?? 20,
        masterBudgetGb: value.masterBudgetGb ?? 10,
        masterMaxAgeDays: value.masterMaxAgeDays ?? 30,
      }),
    ),
  pickFolder: (): Promise<string | null> => NativeSoundScraper.pickFolder(),
};

if (__DEV__) {
  // Lets the debugger console drive the same module instance as the UI.
  const g = globalThis as { __soundScraper?: Record<string, unknown> };
  g.__soundScraper = {
    ...g.__soundScraper,
    recorder,
    library,
    settings,
    playlistsApi,
    listAudioApps,
  };
}

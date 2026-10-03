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

/** Mirrors SsRecording in sound_scraper.h. */
export type Recording = {
  /** Name inside the recordings folder; identifies the recording. */
  fileName: string;
  path: string;
  /** ID3 title, or the file name without extension. */
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number;
  sizeBytes: number;
  /** Unix time in milliseconds. */
  recordedAtMs: number;
};

/** Mirrors SsTags in sound_scraper.h. */
export type Tags = {
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  date: string | null;
  genre: string | null;
  comment: string | null;
  track: number | null;
  /** Extracted front cover image, or null if none. */
  coverPath: string | null;
};

/** Mirrors SsTagEdit: only the fields listed in `fields` change. */
export type TagEdit = {
  /** Any of: title, artist, album, albumArtist, date, track, genre, comment. */
  fields: Array<string>;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  date: string | null;
  genre: string | null;
  comment: string | null;
  track: number | null;
  /** 'keep' | 'remove' | 'set' (embed the image at coverPath). */
  cover: string;
  coverPath: string | null;
  /** Write ID3v2.3 instead of ID3v2.4, for older players. */
  id3v23: boolean;
};

export interface Spec extends TurboModule {
  readonly onRecorderEvent: CodegenTypes.EventEmitter<RecorderEvent>;
  /** Fires (payload "changed") when recordings change on disk. */
  readonly onLibraryChanged: CodegenTypes.EventEmitter<string>;

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

  /** Rescans the recordings folder; newest first. */
  listRecordings(): Promise<Array<Recording>>;
  /** Renames on disk (sanitized, de-duplicated); resolves with the new file name. */
  renameRecording(fileName: string, newName: string): Promise<string>;
  trashRecording(fileName: string): Promise<void>;
  /** Shows the file in Finder / Explorer. */
  revealRecording(fileName: string): void;

  readTags(fileName: string): Promise<Tags>;
  /** Applies one edit to every listed recording (bulk edit). */
  writeTags(fileNames: Array<string>, edit: TagEdit): Promise<void>;
  /** Native open dialog for a JPEG/PNG; resolves with its path, or null if cancelled. */
  pickImage(): Promise<string | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SoundScraper');

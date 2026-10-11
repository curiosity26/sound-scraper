export type {
  AudioApp,
  CaptureReport,
  RecorderEvent,
  Recording,
  TagEdit,
  Tags,
} from './NativeSoundScraper'

export type RecorderState = 'idle' | 'recording' | 'paused' | 'finalizing'

export type PlayerState = 'empty' | 'stopped' | 'playing' | 'paused'

export type Playlist = { id: number; name: string; count: number }
export type PlaylistItem = { id: number; fileName: string }

export type Quality =
  | 'cbr128'
  | 'cbr192'
  | 'cbr256'
  | 'cbr320'
  | 'vbr0'
  | 'vbr2'

export type SourceRef =
  | { kind: 'system' }
  | { kind: 'app'; id: string | null; name: string }

/** Mirrors core/crates/core/src/settings.rs. */
export type Settings = {
  /** Format version of the saved settings (managed by the core). */
  version?: number
  /** null = the default ~/Music/Sound Scraper. */
  recordingsDir: string | null
  quality: Quality
  id3Version: '2.4' | '2.3'
  lastSource: SourceRef | null
  /** Skin id or unpacked skin folder; null = the Default skin. */
  skin?: string | null
  /** Draw the skinned main panel at twice its size. */
  doubleSize?: boolean
  /** Drop silence before the first and after the last sound (default on). */
  trimSilence?: boolean
  /** Record a lossless master for the track editor (default on). */
  keepMasters?: boolean
  /** Recordings shorter than this drop their master (default 20). */
  masterMinMinutes?: number
  /** Masters together stay under this (default 10). */
  masterBudgetGb?: number
  /** Masters not edited for this long are removed (default 30). */
  masterMaxAgeDays?: number
}

/** The settings as read back: with the folder recordings actually go to. */
export type StoredSettings = Settings & { effectiveRecordingsDir: string }

/** The lossless masters kept for the track editor. */
export type MastersUsage = { count: number; bytes: number }

export type WaveformStatus =
  | { state: 'loading'; progress: number }
  | {
      state: 'ready'
      rate: number
      durationMs: number
      /** The MP3 frame grid lossless cuts land on. */
      frameMs: number | null
      frameOffsetMs: number | null
      /** A lossless master exists: tracks are encoded from it on save. */
      master: boolean
    }
  | { state: 'failed'; message: string }

/** A track an edit makes (ss_editor_tracks). */
export type TrackInfo = {
  name: string
  /** In the original's timeline. */
  startMs: number
  durationMs: number
  /** Has a deleted stretch inside it, so it's re-encoded on save. */
  reencode: boolean
}

export type DetectOptions = {
  thresholdDb: number
  minGapMs: number
  minTrackMs: number
  removeGaps: boolean
}

/** A splice Find Tracks proposes, in a gap. */
export type Proposal = {
  atMs: number
  gapStartMs: number
  gapEndMs: number
  /** With removeGaps: the stretch to delete. */
  delete: [number, number] | null
}

export type SaveResult = {
  readonly files: string[]
  readonly reencoded: number
  readonly fromMaster: boolean
}

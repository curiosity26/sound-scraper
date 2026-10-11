// Domain types for the codegen spec's data (NativeSoundScraper.ts). The
// bridge payloads (settings, playlists, burning, the track editor) are
// generated from the Rust: import those from '@/native/bridge'.
import type { RecorderEvent as SpecRecorderEvent } from './NativeSoundScraper'

export type {
  AudioApp,
  CaptureReport,
  Recording,
  TagEdit,
  Tags,
} from './NativeSoundScraper'

export type RecorderState = 'idle' | 'recording' | 'paused' | 'finalizing'

export type PlayerState = 'empty' | 'stopped' | 'playing' | 'paused'

/** What a recorder event reports (the spec types it as a string). */
export type RecorderEventKind =
  | 'state'
  | 'progress'
  | 'finished'
  | 'error'
  | 'playerState'
  | 'playerProgress'
  | 'playerError'

/** A recorder or player event, with its kind checked (`recorder.onEvent`). */
export type RecorderEvent = Omit<SpecRecorderEvent, 'kind'> & {
  readonly kind: RecorderEventKind
}

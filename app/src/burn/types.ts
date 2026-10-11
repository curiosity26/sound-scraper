// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import type { burnTarget } from '@/skin/burnTarget'

/** Mirrors sound_scraper_disc::Media. */
export type Media = {
  /** 'none' | 'blank' | 'erasable' | 'unusable' | 'image' */
  state: string
  kind: string | null
  /** Sectors available for audio. */
  capacity: number | null
  label: string
}

/** Mirrors sound_scraper_disc::Device. */
export type Device = {
  id: string
  name: string
  /** 'image' | 'simulated' | 'drive' */
  kind: string
  media: Media
  speeds: number[]
  canTest: boolean
  gapless: boolean
  cdText: boolean
}

export type TrackState =
  | 'waiting'
  | 'preparing'
  | 'ready'
  | 'writing'
  | 'done'
  | 'failed'

/** Mirrors core::burn::Status. */
export type BurnStatus = {
  state: 'preparing' | 'writing' | 'done' | 'failed' | 'cancelled'
  phase: string
  destination: string
  kind: string
  tracks: Array<{
    title: string
    durationMs: number
    state: TrackState
    progress: number
  }>
  overall: number
  elapsedMs: number
  remainingMs: number | null
  speedX: number | null
  buffer: number | null
  log: Array<{ atMs: number; text: string }>
  message: string | null
  output: string | null
  testWrite: boolean
}

export type SimSettings = {
  media: 'blank74' | 'blank80' | 'rewritableUsed' | 'none' | 'dvd'
  fault:
    | { kind: 'none' }
    | { kind: 'underrun' | 'removed' | 'writeError'; track: number }
  fast: boolean
}

export type BurnTrackInput = {
  path: string
  title: string
  performer: string | null
  durationMs: number
}

export type BurnOptions = {
  deviceId: string
  title: string
  tracks: BurnTrackInput[]
  gapSeconds: number
  cdText: boolean
  testWrite: boolean
  speed: number
  eject: boolean
  erase: boolean
  imagePath: string | null
}

/** Whether a burn to `device` can start, and what the button says. */
export type Readiness = {
  ok: boolean
  /** "Burn", "Erase and Burn", "Save Image…" */
  action: string
  /** Why not, or a note. */
  reason?: string
}

export type Target = NonNullable<ReturnType<typeof burnTarget.get>>

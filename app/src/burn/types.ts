// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import type { burnTarget } from '@/skin/burnTarget'

/** Mirrors sound_scraper_disc::Media. */
export type Media = {
  /** 'none' | 'blank' | 'erasable' | 'unusable' | 'image' */
  readonly state: string
  readonly kind: string | null
  /** Sectors available for audio. */
  readonly capacity: number | null
  readonly label: string
}

/** Mirrors sound_scraper_disc::Device. */
export type Device = {
  readonly id: string
  readonly name: string
  /** 'image' | 'simulated' | 'drive' */
  readonly kind: string
  readonly media: Media
  readonly speeds: readonly number[]
  readonly canTest: boolean
  readonly gapless: boolean
  readonly cdText: boolean
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
  readonly state: 'preparing' | 'writing' | 'done' | 'failed' | 'cancelled'
  readonly phase: string
  readonly destination: string
  readonly kind: string
  readonly tracks: ReadonlyArray<{
    readonly title: string
    readonly durationMs: number
    readonly state: TrackState
    readonly progress: number
  }>
  readonly overall: number
  readonly elapsedMs: number
  readonly remainingMs: number | null
  readonly speedX: number | null
  readonly buffer: number | null
  readonly log: ReadonlyArray<{ readonly atMs: number; readonly text: string }>
  readonly message: string | null
  readonly output: string | null
  readonly testWrite: boolean
}

export type SimSettings = {
  readonly media: 'blank74' | 'blank80' | 'rewritableUsed' | 'none' | 'dvd'
  readonly fault:
    | { readonly kind: 'none' }
    | {
        readonly kind: 'underrun' | 'removed' | 'writeError'
        readonly track: number
      }
  readonly fast: boolean
}

export type BurnTrackInput = {
  readonly path: string
  readonly title: string
  readonly performer: string | null
  readonly durationMs: number
}

export type BurnOptions = {
  readonly deviceId: string
  readonly title: string
  readonly tracks: readonly BurnTrackInput[]
  readonly gapSeconds: number
  readonly cdText: boolean
  readonly testWrite: boolean
  readonly speed: number
  readonly eject: boolean
  readonly erase: boolean
  readonly imagePath: string | null
}

/** Whether a burn to `device` can start, and what the button says. */
export type Readiness = {
  readonly ok: boolean
  /** "Burn", "Erase and Burn", "Save Image…" */
  readonly action: string
  /** Why not, or a note. */
  readonly reason?: string
}

export type Target = NonNullable<ReturnType<typeof burnTarget.get>>

/** The burn in progress (or last finished). */
export type BurnJob = {
  readonly id: number
  readonly target: Target
  readonly started: number
}

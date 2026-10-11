// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import type { burnTarget } from '@/skin/burnTarget'

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

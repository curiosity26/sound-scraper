import type { Edits, Region } from './types'

/** The deleted region containing `ms`, if any. */
export const deletedAt = (e: Edits, ms: number): Region | undefined => {
  return e.deleted.find(r => ms >= r.startMs && ms < r.endMs)
}

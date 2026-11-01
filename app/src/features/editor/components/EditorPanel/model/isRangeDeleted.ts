import type { Edits } from './types'

/** The whole stretch from `start` to `end` is deleted (inside one region). */
export const isRangeDeleted = (
  e: Edits,
  start: number,
  end: number,
): boolean => {
  return e.deleted.some(r => r.startMs <= start && r.endMs >= end)
}

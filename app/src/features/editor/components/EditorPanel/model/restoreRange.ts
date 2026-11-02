import { newId } from './newId'
import type { Edits, Region } from './types'

/** Brings back the stretch from `start` to `end`: deleted regions lose what overlaps it. */
export const restoreRange = (e: Edits, start: number, end: number): Edits => {
  const kept = e.deleted.flatMap((r): Region[] => {
    if (r.endMs <= start || r.startMs >= end) {
      return [r]
    }
    return [
      ...(r.startMs < start
        ? [{ id: newId(), startMs: r.startMs, endMs: start }]
        : []),
      ...(r.endMs > end ? [{ id: newId(), startMs: end, endMs: r.endMs }] : []),
    ]
  })
  return { ...e, deleted: kept }
}

import { newId } from './newId'
import type { Edits, Region } from './types'

/** Deletes a stretch, merging it with deleted regions it touches. */
export function deleteRegion(e: Edits, a: number, b: number): Edits {
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  if (end - start <= 0) {
    return e
  }
  const kept: Region[] = []
  for (const r of e.deleted) {
    if (r.endMs < start || r.startMs > end) {
      kept.push(r)
    } else {
      start = Math.min(start, r.startMs)
      end = Math.max(end, r.endMs)
    }
  }
  kept.push({ id: newId(), startMs: start, endMs: end })
  kept.sort((x, y) => x.startMs - y.startMs)
  return { ...e, deleted: kept }
}

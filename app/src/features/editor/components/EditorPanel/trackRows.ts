import type { EditorTrack } from '@/bridge/generated'

import type { Edits } from './model'
import type { TrackRow } from './types'

/** Within this, a track starts at a slice (it's that slice's track). */
const SAME_MS = 1

/**
 * The rows of the track list: each track the core works out, with who names
 * it (its slice, or the first track), and, between them, the tracks whose
 * audio is wholly deleted (the core leaves those out), so they can be
 * restored. Kept tracks are numbered 1, 2, 3 as they'll be saved.
 */
export const trackRows = (
  tracks: readonly EditorTrack[],
  shown: Edits,
  durationMs: number,
): TrackRow[] => {
  const kept = tracks.map(tr => {
    const slice =
      tr.startMs < SAME_MS
        ? undefined
        : shown.splices.find(s => Math.abs(s.atMs - tr.startMs) < SAME_MS)
    return {
      ...tr,
      owner: slice
        ? slice.id
        : tr.startMs < SAME_MS
        ? ('first' as const)
        : null,
      name: slice
        ? slice.name
        : tr.startMs < SAME_MS
        ? shown.firstName
        : tr.name,
      tags: slice
        ? slice.tags
        : tr.startMs < SAME_MS
        ? shown.firstTags
        : undefined,
      removed: false,
    }
  })
  // Before the waveform is read there are no tracks at all: nothing's removed.
  if (kept.length === 0) {
    return []
  }
  const starts = [
    {
      atMs: 0,
      owner: 'first' as const,
      name: shown.firstName,
      tags: shown.firstTags,
    },
    ...shown.splices.map(s => ({
      atMs: s.atMs,
      owner: s.id,
      name: s.name,
      tags: s.tags,
    })),
  ]
  const removed = starts
    .filter(
      (s, i) =>
        s.atMs < durationMs &&
        // Two slices at one point make one track (the later one's).
        !starts.some((o, j) => j > i && Math.abs(o.atMs - s.atMs) < SAME_MS) &&
        !kept.some(tr => Math.abs(tr.startMs - s.atMs) < SAME_MS),
    )
    .map(s => ({
      name: s.name,
      startMs: s.atMs,
      durationMs: 0,
      reencode: false,
      owner: s.owner,
      tags: s.tags,
      removed: true,
    }))
  let number = 0
  return [...kept, ...removed]
    .toSorted((a, b) => a.startMs - b.startMs)
    .map(row => ({ ...row, number: row.removed ? null : ++number }))
}

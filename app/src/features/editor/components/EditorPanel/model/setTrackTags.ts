import type { TrackTags } from '@/bridge/generated'

import type { Edits, TrackOwner } from './types'

/**
 * Changes the own tags of the tracks `owners` name (each its slice, or the
 * first track). `change` gets a track's overrides and returns them as they
 * should be; a field left undefined falls back to the recording's tag.
 */
export const setTrackTags = (
  e: Edits,
  owners: readonly TrackOwner[],
  change: (tags: TrackTags) => TrackTags,
): Edits => {
  return {
    ...e,
    ...(owners.includes('first')
      ? { firstTags: change(e.firstTags ?? {}) }
      : {}),
    splices: e.splices.map(s =>
      owners.includes(s.id) ? { ...s, tags: change(s.tags ?? {}) } : s,
    ),
  }
}

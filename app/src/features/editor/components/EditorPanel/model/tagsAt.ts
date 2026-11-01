import type { TrackTags } from '@/bridge/generated'

import type { Edits, Splice } from './types'

/**
 * The tags of the track playing at `atMs`: those of the last splice at or
 * before it (the later one in the list on a tie, as the core plans tracks),
 * else the first track's.
 */
export const tagsAt = (e: Edits, atMs: number): TrackTags | undefined => {
  const owner = e.splices.reduce<Splice | undefined>(
    (best, s) => (s.atMs <= atMs && (!best || s.atMs >= best.atMs) ? s : best),
    undefined,
  )
  return owner ? owner.tags : e.firstTags
}

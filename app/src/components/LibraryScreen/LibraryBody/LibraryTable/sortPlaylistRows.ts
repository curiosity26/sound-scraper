import type { Sort } from '@/library/types'
import type { PlaylistRow } from '@/playlists/types'

import { sortBy } from './sortBy'

/** By position (the playlist's order), or a column; missing rows go last. */
export const sortPlaylistRows = (
  rows: readonly PlaylistRow[],
  sort: Sort,
): readonly PlaylistRow[] => {
  if (sort.key === 'position') {
    return sort.ascending ? rows : rows.toReversed()
  }
  const present = rows.flatMap(r =>
    r.recording ? [{ row: r, recording: r.recording }] : [],
  )
  const missing = rows.filter(r => !r.recording)
  return [
    ...sortBy(present, p => p.recording, sort).map(p => p.row),
    ...missing,
  ]
}

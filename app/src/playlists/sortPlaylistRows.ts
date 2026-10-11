import { sortBy } from '@/library/sortBy'
import type { Sort } from '@/library/types'

import type { PlaylistRow } from './types'

/** By position (the playlist's order), or a column; missing rows go last. */
export function sortPlaylistRows(
  rows: PlaylistRow[],
  sort: Sort,
): PlaylistRow[] {
  if (sort.key === 'position') {
    return sort.ascending ? rows : [...rows].reverse()
  }
  const present = rows.filter(r => r.recording)
  const missing = rows.filter(r => !r.recording)
  return [...sortBy(present, r => r.recording!, sort), ...missing]
}

import { filterRecordings } from '@/library/filterRecordings'

import type { PlaylistRow } from './types'

/** Search, like the library's; missing rows match on their file name. */
export function filterPlaylistRows(
  rows: PlaylistRow[],
  query: string,
): PlaylistRow[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return rows
  }
  return rows.filter(row =>
    row.recording
      ? filterRecordings([row.recording], q).length > 0
      : row.item.fileName.toLowerCase().includes(q),
  )
}

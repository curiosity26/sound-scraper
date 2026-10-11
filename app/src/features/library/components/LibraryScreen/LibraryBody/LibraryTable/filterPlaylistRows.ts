import { filterRecordings } from '@/features/library/filterRecordings'
import type { PlaylistRow } from '@/features/playlists/types'

/** Search, like the library's; missing rows match on their file name. */
export const filterPlaylistRows = (
  rows: readonly PlaylistRow[],
  query: string,
): readonly PlaylistRow[] => {
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

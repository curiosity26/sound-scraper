import { displayName } from '@/features/library/displayName'
import type { PlaylistRow } from '@/features/playlists/types'

/** The name shown for a row. */
export const rowName = (row: PlaylistRow): string => {
  return row.recording
    ? displayName(row.recording)
    : row.item.fileName.replace(/\.mp3$/i, '')
}

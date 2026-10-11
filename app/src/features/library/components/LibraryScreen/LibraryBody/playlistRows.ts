import type { PlaylistItem } from '@/bridge/generated'
import type { Recording } from '@/bridge/types'
import type { PlaylistRow } from '@/features/playlists/types'

export const playlistRows = (
  items: readonly PlaylistItem[],
  recordings: readonly Recording[],
): PlaylistRow[] => {
  const byName = new Map(recordings.map(r => [r.fileName, r]))
  return items.map((item, i) => ({
    item,
    position: i + 1,
    recording: byName.get(item.fileName),
  }))
}

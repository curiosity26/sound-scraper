import type { PlaylistItem } from '@/native/bridge'
import type { Recording } from '@/native/types'
import type { PlaylistRow } from '@/playlists/types'

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

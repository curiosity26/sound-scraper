import type { Recording } from '@/bridge/types'

/** Case-insensitive match on name, title, artist and album. */
export const filterRecordings = (
  items: readonly Recording[],
  query: string,
): readonly Recording[] => {
  const q = query.trim().toLowerCase()
  if (!q) {
    return items
  }
  return items.filter(r =>
    [r.fileName, r.title, r.artist, r.album].some(
      v => v != null && v.toLowerCase().includes(q),
    ),
  )
}

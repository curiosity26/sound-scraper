import type { Device } from '@/bridge/generated'
import { formatSectors } from '@/features/playlists/formatSectors'
import type { Capacity } from '@/features/playlists/types'

/** "52:38 with gaps · fits (27:19 free)" */
export const fitLine = (device: Device | undefined, c: Capacity): string => {
  const used = `${formatSectors(c.totalSectors)} with gaps`
  const room = device?.media.capacity
  if (room === null || room === undefined) {
    return used
  }
  return c.totalSectors <= room
    ? `${used} · fits (${formatSectors(room - c.totalSectors)} free)`
    : `${used} · doesn't fit`
}

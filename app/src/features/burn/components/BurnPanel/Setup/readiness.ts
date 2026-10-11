import type { Device } from '@/bridge/generated'
import type { Readiness } from '@/features/burn/types'
import { MAX_TRACKS, SECTORS_74 } from '@/features/playlists/constants'
import { formatSectors } from '@/features/playlists/formatSectors'
import type { Capacity } from '@/features/playlists/types'

export const readiness = (
  device: Device | undefined,
  capacity: Capacity,
): Readiness => {
  if (!device) {
    return { ok: false, action: 'Burn', reason: 'Choose where to burn.' }
  }
  const image = device.kind === 'image'
  const action = image
    ? 'Save Image…'
    : device.media.state === 'erasable'
    ? 'Erase and Burn'
    : 'Burn'
  if (capacity.tracks === 0) {
    return { ok: false, action, reason: 'There are no tracks to burn.' }
  }
  if (capacity.tracks > MAX_TRACKS) {
    return {
      ok: false,
      action,
      reason: `A CD holds at most ${MAX_TRACKS} tracks.`,
    }
  }
  const media = device.media
  if (media.state === 'none') {
    return { ok: false, action, reason: 'Insert a blank CD-R or CD-RW.' }
  }
  if (media.state === 'unusable') {
    return { ok: false, action, reason: media.label }
  }
  const room = media.capacity
  if (room !== null && capacity.totalSectors > room) {
    const over = formatSectors(capacity.totalSectors - room)
    const minutes = room <= SECTORS_74 ? 74 : 80
    return {
      ok: false,
      action,
      reason: image
        ? `${over} too long for an 80-minute CD.`
        : minutes === 74 && capacity.fit === 'fits80'
        ? `${over} too long for this 74-minute disc. Use an 80-minute CD-R.`
        : `${over} too long for this disc.`,
    }
  }
  return { ok: true, action }
}

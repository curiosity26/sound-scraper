import { MAX_TRACKS } from '@/playlists/constants'
import { formatSectors } from '@/playlists/formatSectors'
import type { Capacity } from '@/playlists/types'

/** The sentence under the capacity bar. */
export const capacityText = (c: Capacity): string => {
  switch (c.fit) {
    case 'empty':
      return c.missing > 0
        ? 'Every track here is missing from the library.'
        : 'Add recordings to burn a CD.'
    case 'fits74':
      return `Fits a 74-minute CD with ${formatSectors(
        c.spareSectors,
      )} to spare`
    case 'fits80':
      return `Needs an 80-minute CD (${formatSectors(c.spareSectors)} to spare)`
    case 'tooLong':
      return `${formatSectors(
        -c.spareSectors,
      )} too long for a CD: remove a track or two`
    case 'tooMany':
      return `${c.tracks} tracks: a CD holds at most ${MAX_TRACKS}`
  }
}

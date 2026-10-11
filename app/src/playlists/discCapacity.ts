import {
  FIRST_PREGAP_SECTORS,
  MAX_TRACKS,
  SECTORS_74,
  SECTORS_80,
  SECTORS_PER_SECOND,
} from './constants'
import { trackSectors } from './trackSectors'
import type { Capacity, DiscFit, PlaylistRow } from './types'

/**
 * What a playlist needs on an audio CD with `gapSeconds` between tracks.
 * Missing recordings are skipped, as the burner skips them.
 */
export const discCapacity = (rows: PlaylistRow[], gapSeconds = 2): Capacity => {
  const gap = Math.round(gapSeconds * SECTORS_PER_SECOND)
  let total = 0
  let gaps = 0
  let tracks = 0
  let firstOver = -1
  let missing = 0
  rows.forEach((row, i) => {
    if (!row.recording) {
      missing += 1
      return
    }
    const lead = tracks === 0 ? FIRST_PREGAP_SECTORS : gap
    gaps += lead
    total += lead + trackSectors(row.recording.durationMs)
    tracks += 1
    if (firstOver < 0 && total > SECTORS_80) {
      firstOver = i
    }
  })
  const fit: DiscFit =
    tracks === 0
      ? 'empty'
      : tracks > MAX_TRACKS
      ? 'tooMany'
      : total <= SECTORS_74
      ? 'fits74'
      : total <= SECTORS_80
      ? 'fits80'
      : 'tooLong'
  return {
    tracks,
    totalSectors: total,
    gapSectors: gaps,
    fit,
    spareSectors: (fit === 'fits74' ? SECTORS_74 : SECTORS_80) - total,
    firstOver,
    missing,
  }
}

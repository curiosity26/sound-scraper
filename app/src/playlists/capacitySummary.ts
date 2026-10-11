import { formatSectors } from './formatSectors'
import type { Capacity } from './types'

/** "12 tracks · 52:14 (+0:24 gaps)" */
export const capacitySummary = (c: Capacity): string => {
  const tracks = c.tracks === 1 ? '1 track' : `${c.tracks} tracks`
  const music = formatSectors(c.totalSectors - c.gapSectors)
  const missing = c.missing > 0 ? ` · ${c.missing} missing` : ''
  return c.tracks === 0
    ? `0 tracks${missing}`
    : `${tracks} · ${music} (+${formatSectors(c.gapSectors)} gaps)${missing}`
}

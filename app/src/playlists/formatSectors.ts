import { SECTORS_PER_SECOND } from './constants'

/** m:ss for a sector count (minutes, as CDs are measured: 79:57). */
export function formatSectors(sectors: number): string {
  const seconds = Math.round(Math.abs(sectors) / SECTORS_PER_SECOND)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

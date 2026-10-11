import { MIN_TRACK_SECTORS, SECTORS_PER_SECOND } from './constants'

export const trackSectors = (durationMs: number): number => {
  return Math.max(
    MIN_TRACK_SECTORS,
    Math.ceil((durationMs * SECTORS_PER_SECOND) / 1000),
  )
}

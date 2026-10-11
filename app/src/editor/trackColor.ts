import { TRACK_COLORS } from './constants'

export function trackColor(i: number): string {
  return TRACK_COLORS[i % TRACK_COLORS.length]
}

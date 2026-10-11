import { TRACK_COLORS } from './constants'

export const trackColor = (i: number): string => {
  return TRACK_COLORS[i % TRACK_COLORS.length] ?? TRACK_COLORS[0]
}

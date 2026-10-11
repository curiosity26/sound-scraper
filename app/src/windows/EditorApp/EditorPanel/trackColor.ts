/** Colors for the tracks, in order (muted, like Logic's regions). */
const TRACK_COLORS = [
  '#5b8def',
  '#e0a63b',
  '#58b368',
  '#c46fd8',
  '#e2685f',
  '#4cb7c2',
] as const

export const trackColor = (i: number): string => {
  return TRACK_COLORS[i % TRACK_COLORS.length] ?? TRACK_COLORS[0]
}

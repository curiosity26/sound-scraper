/** Maps a linear level to 0..1 over a 60 dB range. */
export const meterScale = (level: number): number => {
  if (level <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, (20 * Math.log10(level) + 60) / 60))
}

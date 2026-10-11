/** Picks the next preset, wrapping around. */
export const nextPreset = (index: number, count: number): number => {
  return count > 0 ? (index + 1) % count : 0
}

/**
 * Where a needle points for a linear level, in degrees from straight up:
 * the level in dBFS, less `reference` (the dBFS that reads 0 VU), placed
 * on the `range` of VU across `sweep` degrees.
 */
export const needleAngle = (
  level: number,
  style: { sweep: number; range: [number, number]; reference: number },
): number => {
  const [lo, hi] = style.range
  const vu = level > 0 ? 20 * Math.log10(level) - style.reference : -1000
  const t = Math.min(1, Math.max(0, (vu - lo) / (hi - lo)))
  return -style.sweep / 2 + t * style.sweep
}

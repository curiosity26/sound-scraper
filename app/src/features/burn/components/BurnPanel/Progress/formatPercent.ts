/** A 0–1 fraction as a whole percent, "42%"; rounds down unless told otherwise. */
export const formatPercent = (
  fraction: number,
  round: (n: number) => number = Math.floor,
): string => `${String(round(fraction * 100))}%`

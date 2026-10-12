/** "1.5 s", "10 s", "2 min", "300 ms". */
export const formatStep = (ms: number): string => {
  if (ms >= 60_000) {
    return `${String(ms / 60_000)} min`
  }
  if (ms >= 1000) {
    return `${String(ms / 1000)} s`
  }
  return `${String(ms)} ms`
}

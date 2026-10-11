/** "1.5 s", "10 s", "2 min", "300 ms". */
export function formatStep(ms: number): string {
  if (ms >= 60_000) {
    return `${ms / 60_000} min`
  }
  if (ms >= 1000) {
    return `${ms / 1000} s`
  }
  return `${ms} ms`
}

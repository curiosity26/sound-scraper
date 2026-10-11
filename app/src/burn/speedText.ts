/** "Writing at 24x (3,528 KB/s)" */
export function speedText(x: number | null): string | null {
  if (x === null) {
    return null
  }
  const kbs = Math.round((x * 75 * 2352) / 1000)
  return `${x.toFixed(x % 1 === 0 ? 0 : 1)}x (${kbs.toLocaleString(
    'en-US',
  )} KB/s)`
}

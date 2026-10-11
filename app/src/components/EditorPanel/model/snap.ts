/** Snaps `ms` to the nearest multiple of `step`. */
export const snap = (ms: number, step: number): number => {
  return step > 0 ? Math.round(ms / step) * step : ms
}

import { MIN_MS_PER_POINT } from './constants'

/** The zoom that fits `durationMs` in `width` points. */
export const fitZoom = (durationMs: number, width: number): number => {
  return Math.max(MIN_MS_PER_POINT, durationMs / Math.max(1, width))
}

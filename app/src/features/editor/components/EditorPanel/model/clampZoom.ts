import { MIN_MS_PER_POINT } from './constants'
import { fitZoom } from './fitZoom'

export const clampZoom = (
  msPerPoint: number,
  durationMs: number,
  width: number,
): number => {
  return Math.min(
    fitZoom(durationMs, width),
    Math.max(MIN_MS_PER_POINT, msPerPoint),
  )
}

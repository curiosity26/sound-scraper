import type { ResolvedAnimation } from '@/native/bridge'
import { meterScale } from '@/skin/meterScale'

/** Frames per second, scaled by loudness for speed "level". */
export const animationRate = (
  fps: number,
  speed: ResolvedAnimation['speed'],
  level: number,
) => {
  return speed === 'level' ? fps * (0.3 + 1.7 * meterScale(level)) : fps
}

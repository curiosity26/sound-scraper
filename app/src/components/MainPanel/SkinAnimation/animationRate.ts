import { meterScale } from '@/skin/meterScale'

/** Frames per second, scaled by loudness for speed "level". */
export const animationRate = (fps: number, speed: string, level: number) => {
  return speed === 'level' ? fps * (0.3 + 1.7 * meterScale(level)) : fps
}

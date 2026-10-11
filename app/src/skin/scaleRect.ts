import type { Rect } from './types'

export const scaleRect = (rect: Rect, s: number) => {
  return {
    position: 'absolute' as const,
    left: rect[0] * s,
    top: rect[1] * s,
    width: rect[2] * s,
    height: rect[3] * s,
  }
}

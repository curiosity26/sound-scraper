import type { ResolvedElement } from '@/native/bridge'

/** `style.thumbSize`, or a thumb half as wide as the bar is tall. */
export const thumbSize = (element: ResolvedElement): [number, number] => {
  const size = element.style?.thumbSize
  if (
    Array.isArray(size) &&
    size.length === 2 &&
    typeof size[0] === 'number' &&
    typeof size[1] === 'number'
  ) {
    return [size[0], size[1]]
  }
  const h = element.rect[3]
  return [Math.max(4, Math.round(h / 2)), h]
}

import type { Rect } from '@/features/skins/types'

/** An [x, y, width, height] (or a nine-slice's four insets). */
export const isRect = (value: unknown): value is Rect =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(v => typeof v === 'number')

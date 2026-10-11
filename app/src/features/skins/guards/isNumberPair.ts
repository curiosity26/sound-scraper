/** An [x, y] or [width, height] pair. */
export const isNumberPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(v => typeof v === 'number')

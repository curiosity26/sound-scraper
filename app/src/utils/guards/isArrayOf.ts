import type { Guard } from './types'

export const isArrayOf =
  <T>(guard: Guard<T>): Guard<T[]> =>
  (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(guard)

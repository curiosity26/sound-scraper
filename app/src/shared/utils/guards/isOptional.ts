import type { Guard } from './types'

/** T or absent (a field serde skips when empty). */
export const isOptional =
  <T>(guard: Guard<T>): Guard<T | undefined> =>
  (value: unknown): value is T | undefined =>
    value === undefined || guard(value)

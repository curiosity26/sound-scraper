import type { Guard } from './types'

/** One of the given literal values (a Rust unit enum). */
export const isOneOf =
  <const T extends readonly (string | number | boolean | null)[]>(
    ...values: T
  ): Guard<T[number]> =>
  (value: unknown): value is T[number] =>
    values.some(v => v === value)

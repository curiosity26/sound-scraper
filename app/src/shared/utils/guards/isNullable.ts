import type { Guard } from './types'

/** T or null (a Rust `Option<T>` serialized as null). */
export const isNullable =
  <T>(guard: Guard<T>): Guard<T | null> =>
  (value: unknown): value is T | null =>
    value === null || guard(value)

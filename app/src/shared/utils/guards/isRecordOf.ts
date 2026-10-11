import type { Guard } from './types'

/** A string-keyed map (a Rust HashMap/BTreeMap) of T. */
export const isRecordOf =
  <T>(guard: Guard<T>): Guard<Record<string, T>> =>
  (value: unknown): value is Record<string, T> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(guard)

import type { FieldGuards, Guard } from './types'

/** A guard for an object type, built from a guard per field. */
export const isShape =
  <T extends object>(fields: FieldGuards<T>): Guard<T> =>
  (value: unknown): value is T => {
    if (typeof value !== 'object' || value === null) {
      return false
    }
    for (const key in fields) {
      if (!fields[key](Reflect.get(value, key))) {
        return false
      }
    }
    return true
  }

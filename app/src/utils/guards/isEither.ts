import type { Guard } from './types'

/** Matches any of the guards (a Rust enum with data, or a union). */
export const isEither =
  <T extends readonly Guard<unknown>[]>(
    ...guards: T
  ): Guard<T[number] extends Guard<infer U> ? U : never> =>
  (value: unknown): value is T[number] extends Guard<infer U> ? U : never =>
    guards.some(g => g(value))

import type { Guard } from '@/utils/guards'

/**
 * A guard for a tagged union (a Rust enum with `#[serde(tag = …)]`), from a
 * guard per variant keyed by its tag. Every variant needs a guard, so a
 * variant added to T doesn't compile until it's checked too.
 */
export const isVariantOf =
  <T extends Record<K, string>, K extends string>(
    tag: K,
    variants: { readonly [V in T[K]]: Guard<Extract<T, Record<K, V>>> },
  ): Guard<T> =>
  (value: unknown): value is T =>
    typeof value === 'object' &&
    value !== null &&
    Object.entries<Guard<T>>(variants).some(
      ([name, guard]) => Reflect.get(value, tag) === name && guard(value),
    )

import { type Guard, isOneOf } from '@/shared/utils/guards'

/**
 * isOneOf for a string union T that must list every member:
 * `isUnionOf<BurnState>()('preparing', …)`. Leaving one out (say Rust
 * gains a variant) doesn't compile, and neither does a value outside T.
 */
export const isUnionOf =
  <T extends string>() =>
  <const L extends readonly T[]>(
    ...values: L &
      ([Exclude<T, L[number]>] extends [never]
        ? L
        : { readonly missing: Exclude<T, L[number]> })
  ): Guard<T> =>
    isOneOf(...values)

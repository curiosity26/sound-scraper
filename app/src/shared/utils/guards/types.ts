/** Checks at runtime that a value has type T. */
export type Guard<T> = (value: unknown) => value is T

/**
 * A guard for every field of T, optional fields included, so a field
 * added to T (e.g. a regenerated bridge type) stops the guard compiling
 * until it checks the new field too.
 */
export type FieldGuards<T> = { readonly [K in keyof T]-?: Guard<T[K]> }

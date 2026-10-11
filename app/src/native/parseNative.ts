import type { Guard } from '@/utils/guards'

/**
 * Parses JSON from the native side and checks it with `guard`; throws when
 * it doesn't match (`what` names the data in the message).
 */
export const parseNative = <T>(
  json: string,
  guard: Guard<T>,
  what: string,
): T => {
  // `find` hands the parsed value straight to the guard, so it's never
  // held untyped. JSON has no `undefined`, so a miss means no match.
  const value = [JSON.parse(json)].find(guard)
  if (value === undefined) {
    throw new TypeError(`Unexpected ${what} from the native side`)
  }
  return value
}

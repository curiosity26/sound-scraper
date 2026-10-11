/**
 * Parses JSON from the core and checks its shape; throws when it doesn't
 * match (`what` names the data in the message).
 */
export const parseJson = <T>(
  json: string,
  isT: (value: unknown) => value is T,
  what: string,
): T => {
  const value: unknown = JSON.parse(json)
  if (!isT(value)) {
    throw new TypeError(`Unexpected ${what} from the native side`)
  }
  return value
}

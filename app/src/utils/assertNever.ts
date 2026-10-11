/** Ends an exhaustive `switch`: a new union member becomes a compile error. */
export const assertNever = (value: never): never => {
  throw new TypeError(`Unhandled value: ${String(value)}`)
}

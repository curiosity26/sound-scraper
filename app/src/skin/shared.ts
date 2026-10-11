/** A value shared by every window (they run in one JS runtime). */
export const shared = <T>(initial: T) => {
  let value = initial
  const subscribers = new Set<(v: T) => void>()
  return {
    get: (): T => value,
    set: (v: T) => {
      value = v
      subscribers.forEach(l => {
        l(v)
      })
    },
    subscribe: (listener: (v: T) => void): (() => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
  }
}

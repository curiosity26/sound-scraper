// Stable promises for use(): the same key returns the same promise across
// renders, and a rejected promise is dropped so the next read retries.
export type PromiseCache<K, V> = {
  readonly get: (key: K) => Promise<V>
  /** Forgets one key, or every key, so the next read loads again. */
  readonly clear: (key?: K) => void
}

export const promiseCache = <K, V>(
  load: (key: K) => Promise<V>,
): PromiseCache<K, V> => {
  const promises = new Map<K, Promise<V>>()
  return {
    get: key => {
      const cached = promises.get(key)
      if (cached) {
        return cached
      }
      const promise = load(key)
      promises.set(key, promise)
      promise.catch(() => {
        if (promises.get(key) === promise) {
          promises.delete(key)
        }
      })
      return promise
    },
    clear: key => {
      if (key === undefined) {
        promises.clear()
      } else {
        promises.delete(key)
      }
    },
  }
}

import { setTimeout as sleep } from 'node:timers/promises'

export type EventuallyOptions = {
  readonly timeoutMs?: number
  readonly intervalMs?: number
}

/**
 * Runs `check` until it returns without throwing, and returns its result;
 * after `timeoutMs` throws its last error.
 */
export const eventually = async <T>(
  check: () => T | Promise<T>,
  options: EventuallyOptions = {},
): Promise<T> => {
  const { timeoutMs = 15_000, intervalMs = 250 } = options
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await check()
    } catch (e) {
      if (Date.now() >= deadline) {
        throw e
      }
    }
    await sleep(intervalMs)
  }
}

// The selected recording(s)' tags and library entries, as a promise for
// use() under <Suspense>. A new selection starts a new read; a refresh swaps
// in a new promise inside a transition, so the pane keeps showing the old
// values while the files are read again.
import { startTransition, useState } from 'react'

import { readDetails } from './readDetails'
import type { RecordingDetails } from './types'

/** A read of one selection, which knows whether it failed (so Retry knows
 * to read again). */
const read = (key: string) => {
  let failed = false
  const promise = readDetails(key.split('\u0000').filter(Boolean))
  promise.catch(() => {
    failed = true
  })
  return { key, promise, failed: () => failed }
}

export type UseDetailsReadResult = {
  /** Identifies the selection (changes when it does). */
  readonly key: string
  /** Resolves with what the pane shows; replaced on every refresh. */
  readonly details: Promise<RecordingDetails>
  /** Reads again after a write, keeping the current values on screen. */
  readonly refresh: () => void
  /** Reads again after a failed read (the error boundary's Retry). */
  readonly retry: () => void
}

export const useDetailsRead = (
  fileNames: readonly string[],
): UseDetailsReadResult => {
  const key = fileNames.join('\u0000')
  const [current, setCurrent] = useState(() => read(key))
  let shown = current
  if (current.key !== key) {
    // A new selection: read it now, while rendering, rather than one render
    // late in an effect (React's "adjusting state when a prop changes").
    shown = read(key)
    setCurrent(shown)
  }
  return {
    key,
    details: shown.promise,
    refresh: () => {
      startTransition(() => {
        setCurrent(read(key))
      })
    },
    // The boundary also resets when the selection or a refresh brings a new
    // promise; only a failed read needs reading again.
    retry: () => {
      if (shown.failed()) {
        setCurrent(read(key))
      }
    },
  }
}

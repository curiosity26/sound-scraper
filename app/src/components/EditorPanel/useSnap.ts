// Snap: positions land on the ruler's minor ticks. The choice outlives one
// editor.
import { useState } from 'react'

import { snap } from './model'

// A preference that outlives one editor.
let snapPreference = true

export type UseSnapResult = {
  readonly snapOn: boolean
  readonly toggleSnap: () => void
  /** A position snapped (when Snap is on) and kept inside the recording. */
  readonly snapMs: (ms: number) => number
}

export const useSnap = (durationMs: number, stepMs: number): UseSnapResult => {
  const [snapOn, setSnapOn] = useState(snapPreference)
  return {
    snapOn,
    toggleSnap: () => {
      snapPreference = !snapOn
      setSnapOn(!snapOn)
    },
    snapMs: ms =>
      Math.min(durationMs, Math.max(0, snapOn ? snap(ms, stepMs) : ms)),
  }
}

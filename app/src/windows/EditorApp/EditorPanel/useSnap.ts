// Snap: positions land on the ruler's minor ticks. The choice outlives one
// editor (it's an EditorPreferencesProvider preference).
import { useEditorPreferences } from '@/windows/EditorApp/useEditorPreferences'

import { snap } from './model'

export type UseSnapResult = {
  readonly snapOn: boolean
  readonly toggleSnap: () => void
  /** A position snapped (when Snap is on) and kept inside the recording. */
  readonly snapMs: (ms: number) => number
}

export const useSnap = (durationMs: number, stepMs: number): UseSnapResult => {
  const { snapOn, setSnapOn } = useEditorPreferences()
  return {
    snapOn,
    toggleSnap: () => {
      setSnapOn(!snapOn)
    },
    snapMs: ms =>
      Math.min(durationMs, Math.max(0, snapOn ? snap(ms, stepMs) : ms)),
  }
}

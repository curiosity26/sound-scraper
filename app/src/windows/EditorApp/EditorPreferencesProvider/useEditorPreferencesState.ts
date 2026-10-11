import { useMemo, useState } from 'react'

import type { DetectOptions } from '@/native/types'
import { DETECT_PRESETS } from '@/windows/EditorApp/EditorPanel/constants'

export type UseEditorPreferencesStateResult = {
  /** Snap to the ruler's minor ticks. */
  readonly snapOn: boolean
  readonly setSnapOn: (on: boolean) => void
  /** Auto Slice's settings, as last set. */
  readonly detectOptions: DetectOptions
  readonly setDetectOptions: (options: DetectOptions) => void
}

/** Choices in the editor that outlive one recording's editor. */
export const useEditorPreferencesState =
  (): UseEditorPreferencesStateResult => {
    const [snapOn, setSnapOn] = useState(true)
    const [detectOptions, setDetectOptions] = useState<DetectOptions>(() => ({
      ...DETECT_PRESETS.digital,
      removeGaps: false,
    }))
    return useMemo(
      () => ({ snapOn, setSnapOn, detectOptions, setDetectOptions }),
      [snapOn, detectOptions],
    )
  }

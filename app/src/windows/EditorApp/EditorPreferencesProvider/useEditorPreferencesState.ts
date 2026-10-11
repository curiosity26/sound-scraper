import { useMemo, useState } from 'react'

import { DETECT_PRESETS } from '@/windows/EditorApp/EditorPanel/constants'
import type { FindTracksOptions } from '@/windows/EditorApp/types'

export type UseEditorPreferencesStateResult = {
  /** Snap to the ruler's minor ticks. */
  readonly snapOn: boolean
  readonly setSnapOn: (on: boolean) => void
  /** Auto Slice's settings, as last set. */
  readonly detectOptions: FindTracksOptions
  readonly setDetectOptions: (options: FindTracksOptions) => void
}

/** Choices in the editor that outlive one recording's editor. */
export const useEditorPreferencesState =
  (): UseEditorPreferencesStateResult => {
    const [snapOn, setSnapOn] = useState(true)
    const [detectOptions, setDetectOptions] = useState<FindTracksOptions>(
      () => ({
        ...DETECT_PRESETS.digital,
        removeGaps: false,
      }),
    )
    return useMemo(
      () => ({ snapOn, setSnapOn, detectOptions, setDetectOptions }),
      [snapOn, detectOptions],
    )
  }

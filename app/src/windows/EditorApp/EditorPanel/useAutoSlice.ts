// Auto Slice: slices proposed where the recording goes quiet, shown while
// its settings change, then applied in one step.
import { useMemo, useState } from 'react'

import { editorCore } from '@/native/editorCore'
import type { DetectOptions, Proposal } from '@/native/types'

import { DETECT_PRESETS } from './constants'
import { applyProposals, type Edits } from './model'

// A preference that outlives one editor.
let detectPreference: DetectOptions = {
  ...DETECT_PRESETS.digital,
  removeGaps: false,
}

export type UseAutoSliceResult = {
  /** Its settings while it's open. */
  readonly options: DetectOptions | null
  readonly proposals: readonly Proposal[]
  readonly toggle: () => void
  readonly setOptions: (o: DetectOptions) => void
  readonly apply: () => void
  readonly cancel: () => void
}

export type UseAutoSliceOptions = {
  readonly editorId: number
  readonly ready: boolean
  /** Closes the name field, returning the edits with the name applied. */
  readonly finishNaming: () => Edits
  readonly commit: (next: Edits) => void
}

export const useAutoSlice = (
  options: UseAutoSliceOptions,
): UseAutoSliceResult => {
  const { editorId, ready } = options
  const [autoSlice, setAutoSlice] = useState<DetectOptions | null>(null)
  const proposals: Proposal[] = useMemo(
    () => (autoSlice && ready ? editorCore.detect(editorId, autoSlice) : []),
    [autoSlice, ready, editorId],
  )
  return {
    options: autoSlice,
    proposals,
    toggle: () => {
      setAutoSlice(autoSlice ? null : detectPreference)
    },
    setOptions: o => {
      detectPreference = o
      setAutoSlice(o)
    },
    apply: () => {
      options.commit(applyProposals(options.finishNaming(), proposals))
      setAutoSlice(null)
    },
    cancel: () => {
      setAutoSlice(null)
    },
  }
}

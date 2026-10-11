// Auto Slice: slices proposed where the recording goes quiet, shown while
// its settings change, then applied in one step.
import { useMemo, useState } from 'react'

import { editorCore } from '@/native/editorCore'
import type { DetectOptions, Proposal } from '@/native/types'
import { useEditorPreferences } from '@/windows/EditorApp/useEditorPreferences'

import { applyProposals, type Edits } from './model'

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
  // The settings it opens with: a preference that outlives one editor.
  const { detectOptions, setDetectOptions } = useEditorPreferences()
  const [autoSlice, setAutoSlice] = useState<DetectOptions | null>(null)
  const proposals: Proposal[] = useMemo(
    () => (autoSlice && ready ? editorCore.detect(editorId, autoSlice) : []),
    [autoSlice, ready, editorId],
  )
  return {
    options: autoSlice,
    proposals,
    toggle: () => {
      setAutoSlice(autoSlice ? null : detectOptions)
    },
    setOptions: o => {
      setDetectOptions(o)
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

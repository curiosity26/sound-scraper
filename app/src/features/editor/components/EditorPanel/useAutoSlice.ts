// Auto Slice: slices proposed where the recording goes quiet, shown while
// its settings change, then applied in one step.
import { useMemo, useState } from 'react'

import type { Proposal } from '@/bridge/generated'
import { editorCore } from '@/features/editor/editorCore'
import { useEditorPreferences } from '@/features/editor/hooks/useEditorPreferences'
import type { FindTracksOptions } from '@/features/editor/types'

import { applyProposals, type Edits } from './model'

export type UseAutoSliceResult = {
  /** Its settings while it's open. */
  readonly options: FindTracksOptions | null
  readonly proposals: readonly Proposal[]
  readonly toggle: () => void
  readonly setOptions: (o: FindTracksOptions) => void
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
  const [autoSlice, setAutoSlice] = useState<FindTracksOptions | null>(null)
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

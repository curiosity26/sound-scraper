import { useState } from 'react'

import { editorCore } from '@/native/editorCore'
import type { MastersUsage } from '@/native/types'

export type UseMastersUsageResult = {
  /** How many lossless masters are kept and their total size. */
  readonly usage: MastersUsage
  /** Deletes every master (recordings stay), then reads the usage again. */
  readonly deleteAll: () => void
}

/** The lossless masters kept for the track editor, and deleting them. */
export const useMastersUsage = (): UseMastersUsageResult => {
  const [usage, setUsage] = useState(() => editorCore.mastersUsage())
  return {
    usage,
    deleteAll: () => {
      void editorCore.deleteAllMasters().then(() => {
        setUsage(editorCore.mastersUsage())
      })
    },
  }
}

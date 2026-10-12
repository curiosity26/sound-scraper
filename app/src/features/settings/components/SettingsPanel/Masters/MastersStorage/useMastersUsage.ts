import { useState } from 'react'

import type { MastersUsage } from '@/bridge/generated'
import { editorCore } from '@/features/editor/editorCore'
import { errorText } from '@/shared/utils/errorText'

export type UseMastersUsageResult = {
  /** How many lossless masters are kept and their total size. */
  readonly usage: MastersUsage
  /** Why the last delete failed. */
  readonly error: string | undefined
  /** Deletes every master (recordings stay), then reads the usage again;
   * a failure sets `error` (and the usage is read again anyway, as some
   * masters may be gone). */
  readonly deleteAll: () => void
}

/** The lossless masters kept for the track editor, and deleting them. */
export const useMastersUsage = (): UseMastersUsageResult => {
  const [usage, setUsage] = useState(() => editorCore.mastersUsage())
  const [error, setError] = useState<string>()
  return {
    usage,
    error,
    deleteAll: () => {
      const deleteAndRead = async () => {
        try {
          await editorCore.deleteAllMasters()
        } finally {
          setUsage(editorCore.mastersUsage())
        }
      }
      setError(undefined)
      deleteAndRead().catch((e: unknown) => {
        setError(errorText(e))
      })
    },
  }
}

// The cuts to check: slices still where the recorder put them from
// now-playing info but couldn't line up with a quiet gap between songs.
import { useState } from 'react'

import { editorCore } from '@/features/editor/editorCore'
import { errorText } from '@/shared/utils/errorText'

export type UseCutChecksResult = {
  /** A slice at `atMs` sits on a guessed song change: worth a listen. */
  readonly needsCheck: (atMs: number) => boolean
}

/** Within this of a marker, a slice is the marker's (it wasn't moved). */
const SAME_MS = 1

const unsnappedOf = (fileName: string): readonly number[] => {
  try {
    return editorCore
      .markers(fileName)
      .filter(m => m.unsnapped)
      .map(m => m.atMs)
  } catch (e) {
    // Without markers there's nothing to flag.
    console.warn(`Reading now-playing markers failed: ${errorText(e)}`)
    return []
  }
}

export const useCutChecks = (fileName: string): UseCutChecksResult => {
  const [unsnapped] = useState(() => unsnappedOf(fileName))
  return {
    needsCheck: atMs => unsnapped.some(m => Math.abs(m - atMs) < SAME_MS),
  }
}

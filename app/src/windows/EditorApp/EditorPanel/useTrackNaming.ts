// Naming a track in place: the name field over a new (or double-clicked)
// track, and renames from the track list.
import { useRef, useState } from 'react'

import { type Edits, renameSplice } from './model'
import type { Naming } from './types'

export type UseTrackNamingResult = {
  /** Whose name the field is editing, if it's open. */
  readonly naming: Naming | null
  /** What's typed in the name field so far. */
  readonly nameDraft: string
  readonly setNameDraft: (text: string) => void
  readonly startNaming: (owner: Naming, name: string) => void
  /**
   * Closes the name field, keeping what was typed (unless `keep` is
   * false). Returns the edits with the name applied, for a handler that
   * changes them further.
   */
  readonly finishNaming: (keep?: boolean) => Edits
  readonly rename: (owner: Naming, name: string) => void
  /** Clicks anywhere (but the field) close the name field first. */
  readonly closeNamingOnPress: {
    readonly onStartShouldSetResponderCapture: () => boolean
  }
}

export const useTrackNaming = (
  edits: Edits,
  commit: (next: Edits) => void,
): UseTrackNamingResult => {
  const [naming, setNaming] = useState<Naming | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  // Updated at once, so a blur that arrives after a click has closed the
  // field doesn't apply the name twice.
  const namingRef = useRef<Naming | null>(null)
  const startNaming = (owner: Naming, name: string) => {
    namingRef.current = owner
    setNameDraft(name)
    setNaming(owner)
  }
  /**
   * Closes the name field, keeping what was typed: on Enter, on blur, and
   * when anything else in the editor is clicked (macOS doesn't blur the
   * field for clicks on non-focusable views). Returns the edits with the
   * name applied, for a handler that changes them further.
   */
  const finishNaming = (keep = true): Edits => {
    const owner = namingRef.current
    if (owner === null) {
      return edits
    }
    namingRef.current = null
    setNaming(null)
    const name = nameDraft.trim()
    if (!keep || !name) {
      return edits
    }
    let renamed = edits
    if (owner === 'first') {
      renamed = name === edits.firstName ? edits : { ...edits, firstName: name }
    } else {
      const slice = edits.splices.find(x => x.id === owner)
      renamed =
        slice && name !== slice.name ? renameSplice(edits, owner, name) : edits
    }
    if (renamed !== edits) {
      commit(renamed)
    }
    return renamed
  }
  return {
    naming,
    nameDraft,
    setNameDraft,
    startNaming,
    finishNaming,
    rename: (owner, name) => {
      commit(
        owner === 'first'
          ? { ...edits, firstName: name }
          : renameSplice(edits, owner, name),
      )
    },
    closeNamingOnPress: {
      onStartShouldSetResponderCapture: () => {
        finishNaming()
        return false
      },
    },
  }
}

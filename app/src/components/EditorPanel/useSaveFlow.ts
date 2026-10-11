// Save: asks in the window whether to keep the original, then writes the
// tracks.
import { useState } from 'react'

import { editorCore } from '@/native/editorCore'
import { errorText } from '@/utils/errorText'

import { type Edits, editsToJson } from './model'
import type { EditorTarget } from './types'

export type SaveState =
  | { kind: 'closed' }
  /** Asking whether to keep the original. */
  | { kind: 'asking' }
  | { kind: 'saving' }
  | { kind: 'failed'; error: string }

export type UseSaveFlowResult = {
  readonly state: SaveState
  /** The save dialog is up (the editor ignores keys and presses). */
  readonly isOpen: boolean
  readonly ask: () => void
  readonly cancel: () => void
  readonly save: (keepOriginal: boolean) => Promise<void>
}

export const useSaveFlow = (
  target: EditorTarget,
  edits: Edits,
  onSaved: (files: string[], keptOriginal: boolean) => void,
): UseSaveFlowResult => {
  const [state, setState] = useState<SaveState>({ kind: 'closed' })
  return {
    state,
    isOpen: state.kind !== 'closed',
    ask: () => {
      setState({ kind: 'asking' })
    },
    cancel: () => {
      setState({ kind: 'closed' })
    },
    save: async keepOriginal => {
      setState({ kind: 'saving' })
      try {
        const result = await editorCore.save(
          target.fileName,
          editsToJson(edits),
          keepOriginal,
        )
        setState({ kind: 'closed' })
        onSaved(result.files, keepOriginal)
      } catch (e) {
        setState({ kind: 'failed', error: errorText(e) })
      }
    },
  }
}

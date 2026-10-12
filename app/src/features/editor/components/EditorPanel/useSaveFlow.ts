// Save: asks in the window whether to keep the original, then writes the
// tracks.
import { useState } from 'react'

import { editorCore } from '@/features/editor/editorCore'
import { errorText } from '@/shared/utils/errorText'

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
  /** Saves; a failure shows in the dialog (state `failed`). */
  readonly save: (keepOriginal: boolean) => void
}

export const useSaveFlow = (
  target: EditorTarget,
  edits: Edits,
  onSaved: (files: string[], keptOriginal: boolean) => void,
): UseSaveFlowResult => {
  const [state, setState] = useState<SaveState>({ kind: 'closed' })
  const save = async (keepOriginal: boolean) => {
    setState({ kind: 'saving' })
    const result = await editorCore.save(
      target.fileName,
      editsToJson(edits),
      keepOriginal,
    )
    setState({ kind: 'closed' })
    onSaved(result.files, keepOriginal)
  }
  const showFailure = (e: unknown) => {
    setState({ kind: 'failed', error: errorText(e) })
  }
  return {
    state,
    isOpen: state.kind !== 'closed',
    ask: () => {
      setState({ kind: 'asking' })
    },
    cancel: () => {
      setState({ kind: 'closed' })
    },
    save: keepOriginal => {
      save(keepOriginal).catch(showFailure)
    },
  }
}

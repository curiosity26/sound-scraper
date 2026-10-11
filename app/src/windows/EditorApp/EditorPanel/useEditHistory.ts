// The edits, with undo, kept as a draft so closing the editor (or a crash)
// loses nothing.
import { useEffect, useState } from 'react'

import { editorCore } from '@/native/editorCore'

import {
  type Edits,
  editsFromJson,
  editsToJson,
  hasEdits,
  type History,
  history,
} from './model'
import type { EditorTarget } from './types'

export type UseEditHistoryResult = {
  readonly edits: Edits
  /** Anything changed from the recording as it is. */
  readonly hasEdits: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly commit: (next: Edits) => void
  readonly undo: () => void
  readonly redo: () => void
}

export const useEditHistory = (target: EditorTarget): UseEditHistoryResult => {
  const [hist, setHist] = useState<History>(() =>
    history.start(
      editsFromJson(editorCore.loadDraft(target.fileName), target.title),
    ),
  )
  const edits = hist.present
  // Keep a draft so closing the editor (or a crash) loses nothing.
  useEffect(() => {
    const timer = setTimeout(() => {
      editorCore.saveDraft(target.fileName, editsToJson(edits))
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [edits, target.fileName])
  return {
    edits,
    hasEdits: hasEdits(edits),
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    commit: next => {
      setHist(h => history.push(h, next))
    },
    undo: () => {
      setHist(history.undo)
    },
    redo: () => {
      setHist(history.redo)
    },
  }
}

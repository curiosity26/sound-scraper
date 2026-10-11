import { useContext } from 'react'

import { EditorContext } from './EditorContext'
import type { UseEditorStateResult } from './useEditorState'

/** The editor this component is part of (inside an EditorPanel). */
export const useEditor = (): UseEditorStateResult => {
  const editor = useContext(EditorContext)
  if (!editor) {
    throw new Error('useEditor outside an EditorPanel')
  }
  return editor
}

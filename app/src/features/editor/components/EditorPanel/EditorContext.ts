import { createContext } from 'react'

import type { UseEditorStateResult } from './useEditorState'

/**
 * The editor open in this window (one per window): its state, shared by
 * the panel's parts so each reads what it shows instead of taking it as
 * props.
 */
export const EditorContext = createContext<UseEditorStateResult | null>(null)

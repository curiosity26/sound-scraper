import { createContext } from 'react'

import type { UseEditorPreferencesStateResult } from './EditorPreferencesProvider'

/** The editor window's preferences (see EditorPreferencesProvider). */
export const EditorPreferencesContext =
  createContext<UseEditorPreferencesStateResult | null>(null)

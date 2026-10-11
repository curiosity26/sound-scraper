import { createContext } from 'react'

import type { UseEditorPreferencesStateResult } from '@/features/editor/components/EditorPreferencesProvider'

/** The editor window's preferences (see EditorPreferencesProvider). */
export const EditorPreferencesContext =
  createContext<UseEditorPreferencesStateResult | null>(null)

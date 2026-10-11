import { useContext } from 'react'

import type { UseEditorPreferencesStateResult } from '@/features/editor/components/EditorPreferencesProvider'
import { EditorPreferencesContext } from '@/features/editor/components/EditorPreferencesProvider/EditorPreferencesContext'

export type UseEditorPreferencesResult = UseEditorPreferencesStateResult

/** The editor's preferences, from the window's EditorPreferencesProvider. */
export const useEditorPreferences = (): UseEditorPreferencesResult => {
  const preferences = useContext(EditorPreferencesContext)
  if (!preferences) {
    throw new Error('useEditorPreferences outside an EditorPreferencesProvider')
  }
  return preferences
}

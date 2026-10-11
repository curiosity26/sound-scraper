import { useContext } from 'react'

import { EditorPreferencesContext } from './EditorPreferencesContext'
import type { UseEditorPreferencesStateResult } from './EditorPreferencesProvider'

export type UseEditorPreferencesResult = UseEditorPreferencesStateResult

/** The editor's preferences, from the window's EditorPreferencesProvider. */
export const useEditorPreferences = (): UseEditorPreferencesResult => {
  const preferences = useContext(EditorPreferencesContext)
  if (!preferences) {
    throw new Error('useEditorPreferences outside an EditorPreferencesProvider')
  }
  return preferences
}

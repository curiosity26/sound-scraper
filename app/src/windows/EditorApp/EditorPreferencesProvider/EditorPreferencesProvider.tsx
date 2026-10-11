import type { FC, ReactNode } from 'react'

import { EditorPreferencesContext } from '@/windows/EditorApp/EditorPreferencesContext'

import { useEditorPreferencesState } from './useEditorPreferencesState'

export type EditorPreferencesProviderProps = {
  readonly children: ReactNode
}

/**
 * Holds the editor's preferences (Snap, Auto Slice's settings) for the
 * window, above the editor that remounts for each recording, so they carry
 * over from one recording to the next. Closing the window only hides it,
 * so they last as long as the app.
 */
export const EditorPreferencesProvider: FC<
  EditorPreferencesProviderProps
> = props => {
  const preferences = useEditorPreferencesState()
  return (
    <EditorPreferencesContext value={preferences}>
      {props.children}
    </EditorPreferencesContext>
  )
}

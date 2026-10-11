import { type FC, useEffect } from 'react'

import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { editorTarget } from '@/skin/editorTarget'
import { windows } from '@/skin/windows'
import { Skinned } from '@/windows/Skinned'

import { EditorContent } from './EditorContent'
import { EditorPreferencesProvider } from './EditorPreferencesProvider'
import { useEditorTarget } from './useEditorTarget'

/** The track editor window: the recording chosen with Edit Track…. */
export const EditorApp: FC = () => {
  const title = useEditorTarget()?.title
  useEffect(() => {
    const subscription = windows.onEvent(e => {
      // Closing the window closes the recording (its edits stay a draft).
      if (e.window === 'editor' && e.event === 'hidden') {
        editorTarget.set(null)
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame
        panel="editor"
        title={title ? `Editor: ${title}` : 'Editor'}
      >
        <EditorPreferencesProvider>
          <EditorContent />
        </EditorPreferencesProvider>
      </SkinPanelFrame>
    </Skinned>
  )
}

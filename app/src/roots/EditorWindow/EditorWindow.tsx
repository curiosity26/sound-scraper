import { type FC, useEffect } from 'react'

import { EditorPreferencesProvider } from '@/features/editor/components/EditorPreferencesProvider'
import { editorTarget } from '@/features/editor/editorTarget'
import { Skinned } from '@/features/skins/components/Skinned'
import { SkinPanelFrame } from '@/features/skins/components/SkinPanelFrame'
import { windows } from '@/features/skins/windows'

import { EditorContent } from './EditorContent'
import { useEditorTarget } from './useEditorTarget'

/** The track editor window: the recording chosen with Edit Track…. */
export const EditorWindow: FC = () => {
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

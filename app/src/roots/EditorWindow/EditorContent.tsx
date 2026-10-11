import type { FC } from 'react'
import { View } from 'react-native'

import { EditorPanel } from '@/features/editor/components/EditorPanel'
import { editorTarget } from '@/features/editor/editorTarget'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { selection } from '@/features/library/selection'
import { playback } from '@/features/playback/playback'
import { windows } from '@/features/skins/windows'
import { styles } from '@/shared/theme/styles'

import { NoRecording } from './NoRecording'
import { useEditorTarget } from './useEditorTarget'

/** The editor window's content: the recording being edited, or a hint. */
export const EditorContent: FC = () => {
  const target = useEditorTarget()
  if (!target) {
    return <NoRecording />
  }
  return (
    <View style={styles.content}>
      <EditorPanel
        key={target.path}
        target={target}
        onSaved={(files, keptOriginal) => {
          if (!keptOriginal && playback.get().path === target.path) {
            playback.clear()
          }
          refreshLibraryViews()
          selection.set(files.slice(0, 1))
          windows.setPanelVisible('editor', false)
          editorTarget.set(null)
        }}
      />
    </View>
  )
}

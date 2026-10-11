import type { FC } from 'react'
import { Text, View } from 'react-native'

import { usePanelText } from '@/hooks/usePanelText'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import { playback } from '@/playback/playback'
import { editorTarget } from '@/skin/editorTarget'
import { windows } from '@/skin/windows'
import { styles } from '@/windows/styles'

import { EditorPanel } from './EditorPanel'
import { useEditorTarget } from './useEditorTarget'

/** The editor window's content: the recording being edited, or a hint. */
export const EditorContent: FC = () => {
  const { fg } = usePanelText('editor')
  const target = useEditorTarget()
  if (!target) {
    return (
      <View style={styles.content}>
        <Text style={[styles.message, fg]}>
          Choose Edit Track… in a recording's details to edit it here.
        </Text>
      </View>
    )
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

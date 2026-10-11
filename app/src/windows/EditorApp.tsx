import { type FC, useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { EditorPanel } from '@/editor/EditorPanel'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import { playback } from '@/playback/playback'
import { editorTarget } from '@/skin/editorTarget'
import { SkinPanelFrame } from '@/skin/SkinPanelFrame'
import { useSkin } from '@/skin/useSkin'
import { windows } from '@/skin/windows'

import { Skinned } from './Skinned'
import { styles } from './styles'
import { usePanelText } from './usePanelText'

const EditorContent: FC = () => {
  const { fg } = usePanelText('editor')
  const skin = useSkin()
  const [target, setTarget] = useState(editorTarget.get)
  useEffect(() => editorTarget.subscribe(setTarget), [])
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
        colors={skin.panels.editor.waveform}
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

/** The track editor window: the recording chosen with Edit Track…. */
export const EditorApp: FC = () => {
  const [title, setTitle] = useState(editorTarget.get()?.title)
  useEffect(() => {
    const unsubscribe = editorTarget.subscribe(t => {
      setTitle(t?.title)
    })
    const subscription = windows.onEvent(e => {
      // Closing the window closes the recording (its edits stay a draft).
      if (e.window === 'editor' && e.event === 'hidden') {
        editorTarget.set(null)
      }
    })
    return () => {
      unsubscribe()
      subscription.remove()
    }
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame
        panel="editor"
        title={title ? `Editor: ${title}` : 'Editor'}
      >
        <EditorContent />
      </SkinPanelFrame>
    </Skinned>
  )
}

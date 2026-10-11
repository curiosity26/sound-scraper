import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { formatStep } from '@/windows/EditorApp/EditorPanel/formatStep'
import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { Divider } from './Divider'
import { HistoryTools } from './HistoryTools'
import { Lcd } from './Lcd'
import { SaveTools } from './SaveTools'
import { SliceTools } from './SliceTools'
import { TransportGroup } from './TransportGroup'

/** Transport and tools, above the timeline. Presses here close the name field first. */
export const EditorToolbar: FC = () => {
  const { snap, view, naming } = useEditor()
  return (
    <View style={styles.toolbar} {...naming.closeNamingOnPress}>
      <TransportGroup />
      <Lcd />
      <Divider />
      <SliceTools />
      <Divider />
      <HistoryTools />
      <Divider />
      <ToolButton
        icon="magnet"
        label="Snap"
        detail={formatStep(view.steps.minor)}
        onPress={snap.toggleSnap}
        active={snap.snapOn}
        testID="editor-snap"
      />
      <View style={styles.flex} />
      <SaveTools />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
})

import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { formatStep } from '@/windows/EditorApp/EditorPanel/formatStep'
import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { DeleteTool } from './DeleteTool'
import { Divider } from './Divider'
import { IconButton } from './IconButton'
import { Lcd } from './Lcd'

/** Transport and tools, above the timeline. Presses here close the name field first. */
export const EditorToolbar: FC = () => {
  const {
    th,
    core,
    transport,
    history,
    snap,
    view,
    autoSlice,
    commands,
    saveFlow,
    naming,
  } = useEditor()
  const { ready } = core
  return (
    <View style={styles.toolbar} {...naming.closeNamingOnPress}>
      <View
        style={[
          styles.transport,
          { borderColor: th.border, backgroundColor: th.well },
        ]}
      >
        <IconButton
          icon="toStart"
          label="To the start"
          onPress={() => {
            void transport.seek(0)
          }}
          disabled={!ready}
        />
        <IconButton
          icon={transport.playing ? 'pause' : 'play'}
          label={transport.playing ? 'Pause' : 'Play'}
          onPress={() => {
            void transport.playPause()
          }}
          disabled={!ready}
          active={transport.playing}
          size={13}
        />
        <IconButton
          icon="stop"
          label="Stop"
          onPress={transport.stop}
          disabled={!transport.loaded}
        />
      </View>
      <Lcd />
      <Divider />
      <ToolButton
        glyph="✂"
        label="Slice"
        onPress={commands.addSliceAtPlayhead}
        disabled={!ready}
        testID="editor-add-slice"
      />
      <ToolButton
        glyph="✶"
        label="Auto Slice"
        onPress={autoSlice.toggle}
        active={autoSlice.options !== null}
        disabled={!ready}
      />
      <DeleteTool />
      <Divider />
      <ToolButton
        glyph="↶"
        label=""
        a11yLabel="Undo"
        onPress={history.undo}
        disabled={!history.canUndo}
      />
      <ToolButton
        glyph="↷"
        label=""
        a11yLabel="Redo"
        onPress={history.redo}
        disabled={!history.canRedo}
      />
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
      <ToolButton
        label="Clear All"
        onPress={commands.clearAll}
        disabled={!history.hasEdits}
      />
      <ToolButton
        label="Save…"
        onPress={saveFlow.ask}
        disabled={!ready || !history.hasEdits}
        accent
      />
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
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 2,
    height: 30,
    marginRight: 4,
  },
})

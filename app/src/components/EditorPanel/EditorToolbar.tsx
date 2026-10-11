import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { DeleteTool } from './DeleteTool'
import { Divider } from './Divider'
import { formatStep } from './formatStep'
import { IconButton } from './IconButton'
import { Lcd } from './Lcd'
import { formatTime } from './model'
import { ToolButton } from './ToolButton'
import type { DeleteTarget, EditorTheme, TimeRange } from './types'
import type { UseEditHistoryResult } from './useEditHistory'
import type { UseEditorTransportResult } from './useEditorTransport'
import type { UseSnapResult } from './useSnap'

export type EditorToolbarProps = {
  readonly th: EditorTheme
  /** The waveform is read. */
  readonly ready: boolean
  readonly transport: UseEditorTransportResult
  /** Where the playhead (or the scrub) is. */
  readonly headMs: number
  readonly durationMs: number
  /** The stretch selected (or being dragged out). */
  readonly liveSelection: TimeRange | null
  readonly history: UseEditHistoryResult
  readonly snap: UseSnapResult
  /** Snap's step, in ms. */
  readonly snapStepMs: number
  readonly autoSliceOn: boolean
  readonly onToggleAutoSlice: () => void
  readonly onSlice: () => void
  readonly deleteTarget: DeleteTarget
  readonly onDelete: () => void
  readonly onClearAll: () => void
  readonly onSave: () => void
  /** Presses here close the name field first. */
  readonly onStartShouldSetResponderCapture: () => boolean
}

/** Transport and tools, above the timeline. */
export const EditorToolbar: FC<EditorToolbarProps> = props => {
  const { th, ready, transport, history, liveSelection } = props
  return (
    <View
      style={styles.toolbar}
      onStartShouldSetResponderCapture={props.onStartShouldSetResponderCapture}
    >
      <View
        style={[
          styles.transport,
          { borderColor: th.border, backgroundColor: th.well },
        ]}
      >
        <IconButton
          th={th}
          icon="toStart"
          label="To the start"
          onPress={() => {
            void transport.seek(0)
          }}
          disabled={!ready}
        />
        <IconButton
          th={th}
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
          th={th}
          icon="stop"
          label="Stop"
          onPress={transport.stop}
          disabled={!transport.loaded}
        />
      </View>
      <Lcd
        th={th}
        main={formatTime(props.headMs, 100)}
        sub={
          liveSelection
            ? `SEL ${formatTime(
                liveSelection.endMs - liveSelection.startMs,
                100,
              )}`
            : `OF ${formatTime(props.durationMs, 1000)}`
        }
      />
      <Divider th={th} />
      <ToolButton
        th={th}
        glyph="✂"
        label="Slice"
        onPress={props.onSlice}
        disabled={!ready}
        testID="editor-add-slice"
      />
      <ToolButton
        th={th}
        glyph="✶"
        label="Auto Slice"
        onPress={props.onToggleAutoSlice}
        active={props.autoSliceOn}
        disabled={!ready}
      />
      <DeleteTool
        th={th}
        target={props.deleteTarget}
        onPress={props.onDelete}
      />
      <Divider th={th} />
      <ToolButton
        th={th}
        glyph="↶"
        label=""
        a11yLabel="Undo"
        onPress={history.undo}
        disabled={!history.canUndo}
      />
      <ToolButton
        th={th}
        glyph="↷"
        label=""
        a11yLabel="Redo"
        onPress={history.redo}
        disabled={!history.canRedo}
      />
      <Divider th={th} />
      <ToolButton
        th={th}
        icon="magnet"
        label="Snap"
        detail={formatStep(props.snapStepMs)}
        onPress={props.snap.toggleSnap}
        active={props.snap.snapOn}
        testID="editor-snap"
      />
      <View style={styles.flex} />
      <ToolButton
        th={th}
        label="Clear All"
        onPress={props.onClearAll}
        disabled={!history.hasEdits}
      />
      <ToolButton
        th={th}
        label="Save…"
        onPress={props.onSave}
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

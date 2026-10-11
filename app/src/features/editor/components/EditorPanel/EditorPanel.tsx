// The track editor (docs/track-editor-design.md §4): a transport bar, an
// overview with zoom sliders, then the timeline (time ruler, a lane with the
// tracks as named regions, and the waveform), a track list, and Save, which
// asks in the window whether to keep the original.
//
// Positions are kept in milliseconds of the original recording. The
// waveform is drawn natively (SSWaveformView) behind a horizontal scroll
// view whose content is the whole recording at the current zoom; the
// ruler, regions, slices, selection and playhead are views in that
// content. (The model calls slices "splices".)
//
// The editor's state (useEditorState) is shared with its parts through
// EditorContext: each part reads what it shows with useEditor.

import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { AutoSliceBar } from './AutoSliceBar'
import { EditorContext } from './EditorContext'
import { EditorHint } from './EditorHint'
import { EditorToolbar } from './EditorToolbar'
import { OverviewBar } from './OverviewBar'
import { SaveModal } from './SaveModal'
import { Timeline } from './Timeline'
import { TrackList } from './TrackList'
import type { EditorTarget } from './types'
import { useEditorState } from './useEditorState'
import { ZoomBar } from './ZoomBar'

export type EditorPanelProps = {
  readonly target: EditorTarget
  /** Saved: the new tracks' file names (the editor should close). */
  readonly onSaved: (files: string[], keptOriginal: boolean) => void
}

export const EditorPanel: FC<EditorPanelProps> = props => {
  const editor = useEditorState(props.target, props.onSaved)
  return (
    <EditorContext value={editor}>
      <View
        ref={editor.rootRef}
        style={styles.root}
        focusable
        {...editor.commands.keyProps}
      >
        <EditorToolbar />
        <AutoSliceBar />
        <OverviewBar />
        <Timeline />
        <ZoomBar />
        <View style={styles.trackListBox} {...editor.naming.closeNamingOnPress}>
          <TrackList />
        </View>
        <EditorHint />
        <SaveModal />
      </View>
    </EditorContext>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  trackListBox: { flexShrink: 1, minHeight: 60 },
})

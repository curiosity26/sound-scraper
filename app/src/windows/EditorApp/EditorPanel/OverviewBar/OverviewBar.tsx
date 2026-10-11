import React, { type FC } from 'react'
import { type GestureResponderEvent, StyleSheet, View } from 'react-native'

import { VSTRIP } from '@/windows/EditorApp/EditorPanel/constants'
import { SSWaveformView } from '@/windows/EditorApp/EditorPanel/SSWaveformView'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { OverviewDeleted } from './OverviewDeleted'
import { OverviewTracks } from './OverviewTracks'
import { ViewBox } from './ViewBox'

const OVERVIEW = 30

/**
 * The whole recording at a glance: its tracks, deleted stretches and a box
 * around what the editor shows. Click or drag to move the view.
 */
export const OverviewBar: FC = () => {
  const { th, core, view } = useEditor()
  const { editorId, durationMs } = core
  const width = view.viewWidth + VSTRIP
  // Shown once the waveform's open and the view has its size.
  if (!(editorId > 0 && view.viewWidth > 0 && durationMs > 0)) {
    return null
  }
  const per = durationMs / Math.max(1, width)
  const go = (e: GestureResponderEvent) => {
    view.centerOn(
      Math.max(0, Math.min(durationMs, e.nativeEvent.locationX * per)),
    )
  }
  return (
    <View style={styles.overviewRow}>
      <View
        testID="editor-overview"
        style={[
          styles.overview,
          {
            width,
            backgroundColor: th.wave('background', '#141210'),
            borderColor: th.border,
          },
        ]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={go}
        onResponderMove={go}
        onResponderTerminationRequest={() => false}
      >
        <OverviewTracks per={per} />
        {/* pointerEvents isn't supported on the native (legacy) view itself:
            setting it there crashes on macOS. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SSWaveformView
            style={StyleSheet.absoluteFill}
            editorId={editorId}
            startMs={0}
            msPerPoint={per}
            colors={view.waveColors}
          />
        </View>
        <OverviewDeleted per={per} />
        <ViewBox per={per} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  overview: {
    height: OVERVIEW,
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
  },
})

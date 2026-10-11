/* eslint-disable react-native/no-inline-styles */

import React, { type FC } from 'react'
import { type GestureResponderEvent, StyleSheet, View } from 'react-native'

import { VSTRIP } from './constants'
import { SSWaveformView } from './SSWaveformView'
import { trackColor } from './trackColor'
import { useEditor } from './useEditor'
import { withAlpha } from './withAlpha'

const OVERVIEW = 30

/**
 * The whole recording at a glance: its tracks, deleted stretches and a box
 * around what the editor shows. Click or drag to move the view.
 */
export const OverviewBar: FC = () => {
  const { th, core, view, drag, tracks } = useEditor()
  const { editorId, durationMs } = core
  const width = view.viewWidth + VSTRIP
  // Shown once the waveform's open and the view has its size.
  if (!(editorId > 0 && view.viewWidth > 0 && durationMs > 0)) {
    return null
  }
  const viewStartMs = view.firstVisible
  const viewEndMs = Math.min(durationMs, view.lastVisible)
  const per = durationMs / Math.max(1, width)
  const go = (e: GestureResponderEvent) => {
    view.centerOn(
      Math.max(0, Math.min(durationMs, e.nativeEvent.locationX * per)),
    )
  }
  const starts = tracks.tracks.map(t => t.startMs)
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
        {tracks.tracks.map((t, i) => (
          <View
            key={`${i}-${t.startMs}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: t.startMs / per,
              width: ((starts[i + 1] ?? durationMs) - t.startMs) / per,
              backgroundColor: withAlpha(trackColor(i), 0x30),
            }}
          />
        ))}
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
        {drag.shown.deleted.map(r => (
          <View
            key={r.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: r.startMs / per,
              width: Math.max(1, (r.endMs - r.startMs) / per),
              backgroundColor: th.wave('deleted', '#00000099'),
            }}
          />
        ))}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: viewStartMs / per,
            width: Math.max(4, (viewEndMs - viewStartMs) / per),
            borderWidth: 1.5,
            borderRadius: 3,
            borderColor: th.text,
            backgroundColor: withAlpha(th.text, 0x14),
          }}
        />
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

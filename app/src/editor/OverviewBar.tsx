/* eslint-disable react-native/no-inline-styles */

import React, { type FC } from 'react'
import { type GestureResponderEvent, StyleSheet, View } from 'react-native'

import type { Edits } from '@/editor/model/types'
import type { TrackInfo } from '@/native/types'

import { OVERVIEW } from './constants'
import { SSWaveformView } from './SSWaveformView'
import { trackColor } from './trackColor'
import type { EditorTheme } from './types'
import { withAlpha } from './withAlpha'

export type OverviewBarProps = {
  readonly th: EditorTheme
  readonly editorId: number
  readonly width: number
  readonly durationMs: number
  readonly colors: string
  readonly viewStartMs: number
  readonly viewEndMs: number
  readonly edits: Edits
  readonly tracks: readonly TrackInfo[]
  readonly onScrollTo: (centerMs: number) => void
}

/**
 * The whole recording at a glance: its tracks, deleted stretches and a box
 * around what the editor shows. Click or drag to move the view.
 */
export const OverviewBar: FC<OverviewBarProps> = props => {
  const { th, width, durationMs } = props
  const per = durationMs / Math.max(1, width)
  const go = (e: GestureResponderEvent) => {
    props.onScrollTo(
      Math.max(0, Math.min(durationMs, e.nativeEvent.locationX * per)),
    )
  }
  const starts = props.tracks.map(t => t.startMs)
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
        {props.tracks.map((t, i) => (
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
            editorId={props.editorId}
            startMs={0}
            msPerPoint={per}
            colors={props.colors}
          />
        </View>
        {props.edits.deleted.map(r => (
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
            left: props.viewStartMs / per,
            width: Math.max(4, (props.viewEndMs - props.viewStartMs) / per),
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

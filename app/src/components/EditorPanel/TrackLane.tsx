import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { HANDLE, LANE } from './constants'
import { formatTime, type Splice } from './model'
import { trackColor } from './trackColor'
import type { EditorTheme, ResponderProps, TrackRow } from './types'
import { withAlpha } from './withAlpha'

export type TrackLaneProps = {
  readonly th: EditorTheme
  readonly contentWidth: number
  /** The zoom, in ms per point. */
  readonly scale: number
  readonly rows: readonly TrackRow[]
  readonly trackEnd: (index: number) => number
  readonly selectedTrack: number | null
  readonly splices: readonly Splice[]
  readonly selectedSlice: number | null
  /** Mark tracks that saving re-encodes. */
  readonly showReencode: boolean
  /** Presses are taken (the waveform is read and no dialog is up). */
  readonly enabled: boolean
  readonly onPressRegion: (index: number) => void
  readonly sliceResponder: (id: number, atMs: number) => ResponderProps
}

/** The lane under the ruler: the tracks as named regions, and the slice edges. */
export const TrackLane: FC<TrackLaneProps> = props => {
  const { th, scale, selectedTrack } = props
  return (
    <View style={[styles.lane, { width: props.contentWidth }]}>
      {props.rows.map((tr, i) => {
        const left = tr.startMs / scale
        const width = Math.max(2, (props.trackEnd(i) - tr.startMs) / scale)
        const selected = selectedTrack === i
        const color = trackColor(i)
        return (
          <View
            key={`${i}-${tr.startMs}`}
            accessibilityLabel={`Track ${i + 1}: ${tr.name}`}
            style={[
              styles.region,
              {
                left: left + 1,
                width: width - 2,
                backgroundColor: withAlpha(color, selected ? 0xb0 : 0x70),
                borderColor: selected ? th.text : color,
              },
            ]}
            onStartShouldSetResponder={() => props.enabled}
            onResponderGrant={() => {
              props.onPressRegion(i)
            }}
          >
            <Text
              numberOfLines={1}
              pointerEvents="none"
              style={styles.regionText}
            >
              <Text style={styles.regionNum}>{i + 1} </Text>
              {tr.name}
              {tr.reencode && props.showReencode ? '  ·' : ''}
            </Text>
          </View>
        )
      })}
      {/* Slice edges: grab to move */}
      {props.splices.map(s => {
        const selected = s.id === props.selectedSlice
        return (
          <View
            key={s.id}
            testID={`editor-slice-${s.id}`}
            accessibilityLabel={`Slice ${s.name} at ${formatTime(s.atMs, 100)}`}
            style={[styles.edge, { left: s.atMs / scale - HANDLE / 2 }]}
            {...props.sliceResponder(s.id, s.atMs)}
          >
            <View
              pointerEvents="none"
              style={[
                styles.edgeGrip,
                selected ? styles.gripSelected : styles.grip,
                {
                  backgroundColor: selected
                    ? th.wave('spliceSelected', '#fff0a0')
                    : th.text,
                },
              ]}
            />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  lane: { height: LANE },
  region: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  regionText: { fontSize: 10, color: '#ffffff', fontWeight: '500' },
  regionNum: { fontWeight: '700', opacity: 0.8 },
  edge: {
    position: 'absolute',
    top: 0,
    width: HANDLE,
    height: LANE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeGrip: { width: 3, height: LANE - 6, borderRadius: 1.5 },
  grip: { opacity: 0.8 },
  gripSelected: { opacity: 1 },
})

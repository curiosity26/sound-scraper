import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/windows/EditorApp/EditorPanel/model'
import { trackColor } from '@/windows/EditorApp/EditorPanel/trackColor'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'
import { withAlpha } from '@/windows/EditorApp/EditorPanel/withAlpha'

import { LANE } from './constants'

/** The grab area either side of a slice. */
const HANDLE = 10

/** The lane under the ruler: the tracks as named regions, and the slice edges. */
export const TrackLane: FC = () => {
  const { th, view, tracks, selection, drag, core, enabled, commands } =
    useEditor()
  const { scale } = view
  const { selectedTrack } = selection
  return (
    <View style={[styles.lane, { width: view.contentWidth }]}>
      {tracks.rows.map((tr, i) => {
        const left = tr.startMs / scale
        const width = Math.max(2, (tracks.trackEnd(i) - tr.startMs) / scale)
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
            onStartShouldSetResponder={() => enabled}
            onResponderGrant={() => {
              commands.pressRegion(i)
            }}
          >
            <Text
              numberOfLines={1}
              pointerEvents="none"
              style={styles.regionText}
            >
              <Text style={styles.regionNum}>{i + 1} </Text>
              {tr.name}
              {tr.reencode && !core.hasMaster ? '  ·' : ''}
            </Text>
          </View>
        )
      })}
      {/* Slice edges: grab to move */}
      {drag.shown.splices.map(s => {
        const selected = s.id === selection.selectedSlice
        return (
          <View
            key={s.id}
            testID={`editor-slice-${s.id}`}
            accessibilityLabel={`Slice ${s.name} at ${formatTime(s.atMs, 100)}`}
            style={[styles.edge, { left: s.atMs / scale - HANDLE / 2 }]}
            {...drag.sliceResponder(s.id, s.atMs)}
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

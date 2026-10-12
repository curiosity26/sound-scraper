import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import type { TrackRow } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/features/editor/components/EditorPanel/withAlpha'

export type TrackRegionProps = {
  readonly track: TrackRow
  /** 0-based; shown 1-based. */
  readonly index: number
}

/** A track as a named region in the lane: press to select it. */
export const TrackRegion: FC<TrackRegionProps> = props => {
  const { track: tr, index: i } = props
  const { th, view, tracks, selection, core, enabled, commands } = useEditor()
  const { scale } = view
  const left = tr.startMs / scale
  const width = Math.max(2, (tracks.trackEnd(i) - tr.startMs) / scale)
  const selected = selection.selectedTrack === i
  const color = trackColor(i)
  return (
    <View
      accessibilityLabel={`Track ${String(i + 1)}: ${tr.name}`}
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
      <Text numberOfLines={1} pointerEvents="none" style={styles.regionText}>
        <Text style={styles.regionNum}>{i + 1} </Text>
        {tr.name}
        {tr.reencode && !core.hasMaster ? '  ·' : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
})

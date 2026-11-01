import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { trackLabel } from '@/features/editor/components/EditorPanel/trackLabel'
import type { TrackRow } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { useRightClick } from '@/features/editor/components/EditorPanel/useRightClick'
import { withAlpha } from '@/shared/utils/withAlpha'

export type TrackRegionProps = {
  readonly track: TrackRow
  /** 0-based; shown 1-based. */
  readonly index: number
}

/**
 * A track as a named region in the lane: press to select it, right-click
 * for its menu. A wholly deleted track is a faint outline.
 */
export const TrackRegion: FC<TrackRegionProps> = props => {
  const { track: tr, index: i } = props
  const { th, view, tracks, selection, core, enabled, commands, trackMenu } =
    useEditor()
  const right = useRightClick((x, y) => {
    trackMenu.open(i, x, y)
  })
  const { scale } = view
  const left = tr.startMs / scale
  const width = Math.max(2, (tracks.trackEnd(i) - tr.startMs) / scale)
  const selected = selection.selectedTracks.includes(i)
  const color = trackColor(i)
  return (
    <View
      ref={right.ref}
      accessibilityLabel={`${trackLabel(tr)}: ${tr.name}`}
      style={[
        styles.region,
        {
          left: left + 1,
          width: width - 2,
          backgroundColor: withAlpha(
            color,
            tr.removed ? 0x18 : selected ? 0xb0 : 0x70,
          ),
          borderColor: selected ? th.text : color,
        },
      ]}
      onStartShouldSetResponder={() => enabled}
      onResponderGrant={e => {
        if (!right.rightPress(e)) {
          commands.pressRegion(i)
        }
      }}
      {...right.clickProps}
    >
      <Text numberOfLines={1} pointerEvents="none" style={styles.regionText}>
        {tr.number !== null && (
          <Text style={styles.regionNum}>{tr.number} </Text>
        )}
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

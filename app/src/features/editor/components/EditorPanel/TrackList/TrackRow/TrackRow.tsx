import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/features/editor/components/EditorPanel/model'
import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { trackLabel } from '@/features/editor/components/EditorPanel/trackLabel'
import { listStyles } from '@/features/editor/components/EditorPanel/TrackList/styles'
import type { TrackRow as Track } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { useRightClick } from '@/features/editor/components/EditorPanel/useRightClick'
import { withAlpha } from '@/shared/utils/withAlpha'

import { CutCheck } from './CutCheck'
import { MetadataButton } from './MetadataButton'
import { pressModifiers } from './pressModifiers'
import { TrackTitle } from './TrackTitle'

export type TrackRowProps = {
  readonly track: Track
  /** 0-based; shown 1-based. */
  readonly index: number
}

/**
 * One track: press to select, play and zoom to it (shift- or Ctrl/⌘-click
 * to select several), double-click or the pencil to edit its tags,
 * right-click for its menu; its name edits in place. A wholly deleted track
 * is dimmed, without a number.
 */
export const TrackRow: FC<TrackRowProps> = props => {
  const { track: tr, index: i } = props
  const { th, selection, core, commands, cuts, trackMenu } = useEditor()
  const right = useRightClick((x, y) => {
    trackMenu.open(i, x, y)
  })
  const selected = selection.selectedTracks.includes(i)
  const start = formatTime(tr.startMs, 100)
  const length = formatTime(tr.durationMs, 100)
  return (
    <Pressable
      ref={right.ref}
      accessibilityRole="button"
      accessibilityLabel={`${trackLabel(tr)}: ${
        tr.name
      }, starts ${start}, ${length} long`}
      accessibilityState={{ selected }}
      onPressIn={e => {
        right.rightPress(e)
      }}
      {...right.clickProps}
      onPress={e => {
        if (!right.rightPress(e)) {
          commands.pressTrack(i, pressModifiers(e))
        }
      }}
      style={[
        listStyles.trackRow,
        selected && { backgroundColor: withAlpha(trackColor(i), 0x38) },
        tr.removed && styles.removed,
      ]}
    >
      <View style={[listStyles.colNum, styles.numCell]}>
        <View style={[styles.chip, { backgroundColor: trackColor(i) }]} />
        <Text style={[styles.cell, { color: th.text }]}>
          {tr.number ?? '–'}
        </Text>
      </View>
      <TrackTitle track={tr} index={i} />
      <MetadataButton track={tr} index={i} />
      <View style={[listStyles.colTime, styles.lengthCell]}>
        {typeof tr.owner === 'number' && cuts.needsCheck(tr.startMs) && (
          <CutCheck />
        )}
        <Text style={[styles.cell, { color: th.dim }]}>{start}</Text>
      </View>
      <View style={[listStyles.colTime, styles.lengthCell]}>
        {tr.reencode && !core.hasMaster && (
          <Text
            style={[styles.pill, { color: th.dim, borderColor: th.border }]}
          >
            re-encodes
          </Text>
        )}
        <Text style={[styles.cell, { color: th.dim }]}>{length}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  removed: { opacity: 0.5 },
  numCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { width: 8, height: 8, borderRadius: 2 },
  lengthCell: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  cell: { fontSize: 12, fontVariant: ['tabular-nums'] },
  pill: {
    fontSize: 9,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
})

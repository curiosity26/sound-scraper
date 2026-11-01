import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/features/editor/components/EditorPanel/model'
import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { listStyles } from '@/features/editor/components/EditorPanel/TrackList/styles'
import type { TrackRow as Track } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/shared/utils/withAlpha'

import { CutCheck } from './CutCheck'
import { pressModifiers } from './pressModifiers'
import { TagsButton } from './TagsButton'
import { TrackTitle } from './TrackTitle'

export type TrackRowProps = {
  readonly track: Track
  /** 0-based; shown 1-based. */
  readonly index: number
}

/**
 * One track: press to select, play and zoom to it (shift- or Ctrl/⌘-click
 * to select several), double-click or ⚙ to edit its tags; its name edits in
 * place.
 */
export const TrackRow: FC<TrackRowProps> = props => {
  const { track: tr, index: i } = props
  const { th, selection, core, commands, cuts } = useEditor()
  const selected = selection.selectedTracks.includes(i)
  const start = formatTime(tr.startMs, 100)
  const length = formatTime(tr.durationMs, 100)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Track ${String(i + 1)}: ${
        tr.name
      }, starts ${start}, ${length} long`}
      accessibilityState={{ selected }}
      onPress={e => {
        commands.pressTrack(i, pressModifiers(e))
      }}
      style={[
        listStyles.trackRow,
        selected && { backgroundColor: withAlpha(trackColor(i), 0x38) },
      ]}
    >
      <View style={[listStyles.colNum, styles.numCell]}>
        <View style={[styles.chip, { backgroundColor: trackColor(i) }]} />
        <Text style={[styles.cell, { color: th.text }]}>{i + 1}</Text>
      </View>
      <TrackTitle track={tr} index={i} />
      <TagsButton index={i} />
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

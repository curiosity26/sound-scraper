import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/features/editor/components/EditorPanel/model'
import { trackColor } from '@/features/editor/components/EditorPanel/trackColor'
import { listStyles } from '@/features/editor/components/EditorPanel/TrackList/styles'
import type { TrackRow as Track } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { withAlpha } from '@/features/editor/components/EditorPanel/withAlpha'

import { TrackName } from './TrackName'

export type TrackRowProps = {
  readonly track: Track
  /** 0-based; shown 1-based. */
  readonly index: number
}

/** One track: press to select, play and zoom to it; its name edits in place. */
export const TrackRow: FC<TrackRowProps> = props => {
  const { track: tr, index: i } = props
  const { th, selection, core, commands, naming } = useEditor()
  const selected = selection.selectedTrack === i
  const { owner } = tr
  return (
    <Pressable
      onPress={() => {
        commands.openTrack(i)
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
      {owner === null ? (
        <Text style={[listStyles.colName, styles.cell, { color: th.text }]}>
          {tr.name}
        </Text>
      ) : (
        <TrackName
          value={tr.name}
          onCommit={name => {
            naming.rename(owner, name)
          }}
        />
      )}
      <Text style={[listStyles.colTime, styles.cell, { color: th.dim }]}>
        {formatTime(tr.startMs, 100)}
      </Text>
      <View style={[listStyles.colTime, styles.lengthCell]}>
        {tr.reencode && !core.hasMaster && (
          <Text
            style={[styles.pill, { color: th.dim, borderColor: th.border }]}
          >
            re-encodes
          </Text>
        )}
        <Text style={[styles.cell, { color: th.dim }]}>
          {formatTime(tr.durationMs, 100)}
        </Text>
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

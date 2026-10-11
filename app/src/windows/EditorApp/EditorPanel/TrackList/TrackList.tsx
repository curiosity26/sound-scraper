import React, { type FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/windows/EditorApp/EditorPanel/model'
import { trackColor } from '@/windows/EditorApp/EditorPanel/trackColor'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'
import { withAlpha } from '@/windows/EditorApp/EditorPanel/withAlpha'

import { TrackName } from './TrackName'

/** The tracks the edits make: pick one to select, play and zoom to it; rename it in place. */
export const TrackList: FC = () => {
  const { th, tracks, selection, core, commands, naming } = useEditor()
  return (
    <View style={[styles.tracks, { borderColor: th.border }]}>
      <View
        style={[
          styles.trackRow,
          styles.trackHeader,
          { borderBottomColor: th.border },
        ]}
      >
        <Text style={[styles.colNum, styles.headerText, { color: th.dim }]}>
          #
        </Text>
        <Text style={[styles.colName, styles.headerText, { color: th.dim }]}>
          Title and file name
        </Text>
        <Text style={[styles.colTime, styles.headerText, { color: th.dim }]}>
          Start
        </Text>
        <Text style={[styles.colTime, styles.headerText, { color: th.dim }]}>
          Length
        </Text>
      </View>
      <ScrollView>
        {tracks.rows.map((tr, i) => {
          const selected = selection.selectedTrack === i
          const { owner } = tr
          return (
            <Pressable
              key={`${i}-${tr.startMs}`}
              onPress={() => {
                commands.openTrack(i)
              }}
              style={[
                styles.trackRow,
                selected && { backgroundColor: withAlpha(trackColor(i), 0x38) },
              ]}
            >
              <View style={[styles.colNum, styles.numCell]}>
                <View
                  style={[styles.chip, { backgroundColor: trackColor(i) }]}
                />
                <Text style={[styles.cell, { color: th.text }]}>{i + 1}</Text>
              </View>
              {owner === null ? (
                <Text style={[styles.colName, styles.cell, { color: th.text }]}>
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
              <Text style={[styles.colTime, styles.cell, { color: th.dim }]}>
                {formatTime(tr.startMs, 100)}
              </Text>
              <View style={[styles.colTime, styles.lengthCell]}>
                {tr.reencode && !core.hasMaster && (
                  <Text
                    style={[
                      styles.pill,
                      { color: th.dim, borderColor: th.border },
                    ]}
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
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  tracks: {
    height: 112,
    flexShrink: 1,
    minHeight: 54,
    marginTop: 6,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trackHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  colNum: { width: 34 },
  numCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { width: 8, height: 8, borderRadius: 2 },
  colName: { flex: 1 },
  colTime: { width: 120, textAlign: 'right' },
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

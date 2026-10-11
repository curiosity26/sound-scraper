import React, { type FC } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { TrackListHeader } from './TrackListHeader'
import { TrackRow } from './TrackRow'

/** The tracks the edits make: pick one to select, play and zoom to it; rename it in place. */
export const TrackList: FC = () => {
  const { th, tracks } = useEditor()
  return (
    <View style={[styles.tracks, { borderColor: th.border }]}>
      <TrackListHeader />
      <ScrollView>
        {tracks.rows.map((tr, i) => (
          <TrackRow key={`${i}-${tr.startMs}`} track={tr} index={i} />
        ))}
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
})

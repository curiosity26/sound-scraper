import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { LANE } from '@/windows/EditorApp/EditorPanel/Timeline/constants'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { SliceEdge } from './SliceEdge'
import { TrackRegion } from './TrackRegion'

/** The lane under the ruler: the tracks as named regions, and the slice edges. */
export const TrackLane: FC = () => {
  const { view, tracks, drag } = useEditor()
  return (
    <View style={[styles.lane, { width: view.contentWidth }]}>
      {tracks.rows.map((tr, i) => (
        <TrackRegion key={`${i}-${tr.startMs}`} track={tr} index={i} />
      ))}
      {/* Slice edges: grab to move */}
      {drag.shown.splices.map(s => (
        <SliceEdge key={s.id} slice={s} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  lane: { height: LANE },
})

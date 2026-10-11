import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  formatTime,
  type Splice,
} from '@/features/editor/components/EditorPanel/model'
import { LANE } from '@/features/editor/components/EditorPanel/Timeline/constants'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

/** The grab area either side of a slice. */
const HANDLE = 10

export type SliceEdgeProps = {
  readonly slice: Splice
}

/** A slice's edge in the lane: grab to move it. */
export const SliceEdge: FC<SliceEdgeProps> = props => {
  const { slice: s } = props
  const { th, view, selection, drag } = useEditor()
  const selected = s.id === selection.selectedSlice
  return (
    <View
      testID={`editor-slice-${s.id}`}
      accessibilityLabel={`Slice ${s.name} at ${formatTime(s.atMs, 100)}`}
      style={[styles.edge, { left: s.atMs / view.scale - HANDLE / 2 }]}
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
}

const styles = StyleSheet.create({
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

import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { CHECK_CUT_COLOR } from '@/features/editor/components/EditorPanel/constants'
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

/**
 * A slice's edge in the lane: grab to move it. A slice placed from
 * now-playing info without a quiet gap to line up with has an amber grip:
 * check the cut.
 */
export const SliceEdge: FC<SliceEdgeProps> = props => {
  const { slice: s } = props
  const { th, view, selection, drag, cuts } = useEditor()
  const selected = s.id === selection.selectedSlice
  const check = cuts.needsCheck(s.atMs)
  return (
    <View
      accessibilityLabel={`Slice ${s.name} at ${formatTime(s.atMs, 100)}${
        check ? ', check this cut' : ''
      }`}
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
              : check
              ? CHECK_CUT_COLOR
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

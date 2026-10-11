import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'
import { withAlpha } from '@/windows/EditorApp/EditorPanel/withAlpha'

import { overlayStyles } from './styles'

/** The stretch being dragged out, or else the selected one. */
export const SelectionBand: FC = () => {
  const { th, view, drag } = useEditor()
  const range = drag.liveSelection
  if (!range) {
    return null
  }
  const { scale } = view
  return (
    <View
      pointerEvents="none"
      style={[
        overlayStyles.band,
        styles.selection,
        {
          left: range.startMs / scale,
          width: Math.max(1, (range.endMs - range.startMs) / scale),
          backgroundColor: th.wave('selection', '#ffffff30'),
          borderColor: withAlpha(th.text, 0x90),
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  selection: { borderLeftWidth: 1, borderRightWidth: 1 },
})

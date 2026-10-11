import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

/** Marks along the top at the audio frames' boundaries. */
export const FrameTicks: FC = () => {
  const { th, view } = useEditor()
  const { scale } = view
  return (
    <>
      {view.frameTicks.map(ms => (
        <View
          key={`f${ms}`}
          pointerEvents="none"
          style={[
            styles.frameTick,
            {
              left: ms / scale,
              backgroundColor: th.wave('rulerText', '#f3ead0'),
            },
          ]}
        />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  frameTick: {
    position: 'absolute',
    top: 0,
    height: 6,
    width: StyleSheet.hairlineWidth,
    opacity: 0.35,
  },
})

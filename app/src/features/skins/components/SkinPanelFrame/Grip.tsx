// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { View } from 'react-native'

import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import type { Rect } from '@/features/skins/types'

export type GripProps = {
  readonly rect: Rect
  readonly color: string
}

/** A staircase of dots in the resize corner. */
export const Grip: FC<GripProps> = props => {
  const [x, y, w, h] = props.rect
  const s = useSkinScale()
  const dots = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row + col >= 2) {
        dots.push(
          <View
            key={`${row}-${col}`}
            style={{
              position: 'absolute',
              left: w - (3 - col) * 3 * s - s,
              top: h - (3 - row) * 3 * s - s,
              width: 2 * s,
              height: 2 * s,
              backgroundColor: props.color,
            }}
          />,
        )
      }
    }
  }
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
    >
      {dots}
    </View>
  )
}

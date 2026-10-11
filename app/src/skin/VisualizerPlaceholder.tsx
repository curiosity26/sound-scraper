// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react'
import { View } from 'react-native'

import { color } from './color'
import { scaleRect } from './scaleRect'
import type { SkinElement } from './types'
import { useSkinScale } from './useSkinScale'

/**
 * Where the visualizer will draw (phase 2: a native view fed by the Rust
 * analyzer). For now: the style's grid and a flat line.
 */
export const VisualizerPlaceholder = (props: { element: SkinElement }) => {
  const s = useSkinScale()
  const box = scaleRect(props.element.rect, s)
  const { width: w, height: h } = box
  const st = props.element.style ?? {}
  const grid = color(st.grid, '#ffffff1a')
  const line = color(st.line, '#9fd630')
  return (
    <View testID="visualizer" pointerEvents="none" style={box}>
      {Array.from({ length: Math.floor(w / (8 * s)) + 1 }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * 8 * s,
            top: 0,
            width: s,
            height: h,
            backgroundColor: grid,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: Math.floor(h / 2),
          width: w,
          height: s,
          backgroundColor: line,
        }}
      />
    </View>
  )
}

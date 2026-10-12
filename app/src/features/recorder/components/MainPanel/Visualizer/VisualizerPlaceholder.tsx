import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import type { ResolvedElement } from '@/bridge/generated'
import { color } from '@/features/recorder/components/MainPanel/color'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

export type VisualizerPlaceholderProps = {
  readonly element: ResolvedElement
}

/**
 * Where the visualizer will draw (phase 2: a native view fed by the Rust
 * analyzer). For now: the style's grid and a flat line.
 */
export const VisualizerPlaceholder: FC<VisualizerPlaceholderProps> = props => {
  const s = useSkinScale()
  const box = scaleRect(props.element.rect, s)
  const { width: w, height: h } = box
  const st = props.element.style ?? {}
  const grid = color(st.grid, '#ffffff1a')
  const line = color(st.line, '#9fd630')
  return (
    <View pointerEvents="none" style={box}>
      {Array.from({ length: Math.floor(w / (8 * s)) + 1 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.gridLine,
            { left: i * 8 * s, width: s, height: h, backgroundColor: grid },
          ]}
        />
      ))}
      <View
        style={[
          styles.line,
          {
            top: Math.floor(h / 2),
            width: w,
            height: s,
            backgroundColor: line,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  gridLine: { position: 'absolute', top: 0 },
  line: { position: 'absolute', left: 0 },
})

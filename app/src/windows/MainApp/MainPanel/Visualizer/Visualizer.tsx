// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Pressable } from 'react-native'

import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { ResolvedElement } from '@/native/bridge'
import { scaleRect } from '@/skin/scaleRect'

import { useVisualizerPreset } from './useVisualizerPreset'
import { VisualizerNative } from './VisualizerNative'
import { VisualizerPlaceholder } from './VisualizerPlaceholder'

// The native view: SSVisualizerView.mm on macOS, VisualizerView.h on
// Windows. It draws the Rust core's live analysis every display refresh
// while recording, the preset's idle look otherwise.
const SSVisualizerView = VisualizerNative

export type VisualizerProps = {
  readonly element: ResolvedElement
}

/**
 * The visualizer element. Click it to cycle the skin's presets. The
 * element's style supplies idle-look colors (grid, line) presets lack, and
 * `pixelated` (default true) for the hard-edged LCD look.
 */
export const Visualizer: FC<VisualizerProps> = props => {
  const { element } = props
  const skin = useSkin()
  const s = useSkinScale()
  const { preset, cycle } = useVisualizerPreset(skin.visualizer.presets)
  const style = element.style ?? {}
  // Strings compare by value, so the native view only re-applies real changes.
  const json = JSON.stringify({
    grid: style.grid,
    line: style.line,
    ...preset,
  })
  const name = typeof preset.name === 'string' ? preset.name : 'Visualizer'
  return (
    <Pressable
      testID="visualizer"
      accessibilityRole="button"
      accessibilityLabel={`Visualizer: ${name}. Click for the next look.`}
      onPress={cycle}
      style={scaleRect(element.rect, s)}
    >
      {SSVisualizerView ? (
        <SSVisualizerView
          style={{ flex: 1 }}
          preset={json}
          pixelated={style.pixelated !== false}
          skinScale={s}
        />
      ) : (
        <VisualizerPlaceholder
          element={{
            ...element,
            rect: [0, 0, element.rect[2], element.rect[3]],
          }}
        />
      )}
    </Pressable>
  )
}

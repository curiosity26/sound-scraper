// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC, useRef } from 'react'
import { type GestureResponderEvent, View } from 'react-native'

import { useSkinScale } from '@/hooks/useSkinScale'
import type { ImageRef } from '@/native/bridge'
import type { Rect } from '@/skin/types'

import { NineSlice } from './NineSlice'
import { SpriteCell } from './SpriteCell'

export type SkinSliderProps = {
  readonly image: ImageRef
  /** Track and thumb cells in `image`. */
  readonly track: Rect
  readonly thumb: Rect
  /** Optional [top, right, bottom, left] insets for stretching the track. */
  readonly trackSlice?: readonly [number, number, number, number]
  readonly width: number
  readonly height: number
  /** 0..1 */
  readonly value: number
  readonly onChange: (value: number) => void
  /** Called when dragging ends. */
  readonly onCommit?: (value: number) => void
  readonly disabled?: boolean
  readonly accessibilityLabel: string
  readonly testID?: string
}

/**
 * A slider drawn from sprites: the track stretched to the slider's size and
 * the thumb at the value. Vertical when taller than wide (0 at the bottom).
 */
export const SkinSlider: FC<SkinSliderProps> = props => {
  const { image, track, thumb, width, height, disabled } = props
  const s = useSkinScale()
  const vertical = height > width
  const thumbLength = (vertical ? thumb[3] : thumb[2]) * s
  const travel = Math.max(0, (vertical ? height : width) - thumbLength)
  const value = Math.min(1, Math.max(0, props.value))
  const last = useRef(value)

  const valueAt = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent
    const pos = vertical
      ? height - locationY - thumbLength / 2
      : locationX - thumbLength / 2
    return travel > 0 ? Math.min(1, Math.max(0, pos / travel)) : 0
  }
  const move = (e: GestureResponderEvent) => {
    last.current = valueAt(e)
    props.onChange(last.current)
  }

  const thumbPos = vertical ? travel * (1 - value) : travel * value
  return (
    <View
      testID={props.testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ width, height, opacity: disabled ? 0.5 : 1 }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={move}
      onResponderMove={move}
      onResponderRelease={() => props.onCommit?.(last.current)}
    >
      <View pointerEvents="none" style={{ position: 'absolute' }}>
        {props.trackSlice ? (
          <NineSlice
            image={image}
            source={track}
            slice={props.trackSlice}
            width={width}
            height={height}
          />
        ) : (
          <SpriteCell
            image={image}
            at={[track[0], track[1]]}
            size={[track[2], track[3]]}
            drawSize={[width, height]}
          />
        )}
      </View>
      <SpriteCell
        image={image}
        at={[thumb[0], thumb[1]]}
        size={[thumb[2], thumb[3]]}
        style={{
          position: 'absolute',
          left: vertical ? (width - thumb[2] * s) / 2 : thumbPos,
          top: vertical ? thumbPos : (height - thumb[3] * s) / 2,
        }}
      />
    </View>
  )
}

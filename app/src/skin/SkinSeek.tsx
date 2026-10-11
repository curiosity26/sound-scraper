// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useRef, useState } from 'react'
import { type GestureResponderEvent, View } from 'react-native'

import { scaleRect } from './scaleRect'
import { seekGeometry } from './seekGeometry'
import { SpriteCell } from './SpriteCell'
import { thumbSize } from './thumbSize'
import type { SkinElement } from './types'
import { useSkinScale } from './useSkinScale'

type Props = {
  element: SkinElement
  positionMs: number
  durationMs: number
  /** Something is loaded and can be scrubbed. */
  enabled: boolean
  /** While dragging, the position under the pointer; undefined when done. */
  onScrub?: (positionMs: number | undefined) => void
  /** Dragging ended (or a click) at this position. */
  onSeek: (positionMs: number) => void
}

/**
 * The seek bar (scrubber): the track, a fill up to the thumb and the thumb,
 * from the element's sprite cells (track, fill, thumb, thumbPressed,
 * thumbDisabled) or style colors (track, fill, thumb, thumbPressed). Drag
 * or click to seek; it seeks when released.
 */
export const SkinSeek = (props: Props): React.JSX.Element => {
  const { element, enabled, durationMs } = props
  const s = useSkinScale()
  const [, , w, h] = element.rect
  const [tw, th] = thumbSize(element)
  const [drag, setDrag] = useState<number>()
  // The latest drag position, for a release before the next render.
  const last = useRef<number>(undefined)
  const sprite = element.sprite
  const style = element.style ?? {}
  const color = (key: string) =>
    typeof style[key] === 'string' ? style[key] : undefined

  const progress = drag ?? (durationMs > 0 ? props.positionMs / durationMs : 0)
  const { thumbX, fillWidth } = seekGeometry(w, tw, progress)

  const at = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX / s - tw / 2
    const travel = Math.max(1, w - tw)
    return Math.min(1, Math.max(0, x / travel))
  }
  const move = (e: GestureResponderEvent) => {
    const p = at(e)
    last.current = p
    setDrag(p)
    props.onScrub?.(p * durationMs)
  }
  const release = () => {
    if (last.current != null) {
      props.onSeek(last.current * durationMs)
    }
    last.current = undefined
    setDrag(undefined)
    props.onScrub?.(undefined)
  }

  const cell = (state: string) => sprite?.states[state]
  const track = cell('track')
  const fill = cell('fill')
  const thumb =
    (drag != null && cell('thumbPressed')) ||
    (!enabled && cell('thumbDisabled')) ||
    cell('thumb')
  const thumbColor =
    (drag != null && color('thumbPressed')) || color('thumb') || undefined
  const thumbTop = (h - th) / 2

  return (
    <View
      testID="seek"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Position"
      accessibilityValue={{
        min: 0,
        max: Math.round(durationMs / 1000),
        now: Math.round((progress * durationMs) / 1000),
      }}
      style={scaleRect(element.rect, s)}
      onStartShouldSetResponder={() => enabled && durationMs > 0}
      onMoveShouldSetResponder={() => enabled && durationMs > 0}
      onResponderGrant={move}
      onResponderMove={move}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: w * s,
          height: h * s,
        }}
      >
        {sprite && track ? (
          <SpriteCell image={sprite.image} at={track} size={[w, h]} />
        ) : color('track') ? (
          <View
            style={{
              width: w * s,
              height: h * s,
              backgroundColor: color('track'),
            }}
          />
        ) : null}
        {enabled && fillWidth > 0 && (
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            {sprite && fill ? (
              <SpriteCell
                image={sprite.image}
                at={fill}
                size={[fillWidth, h]}
              />
            ) : color('fill') ? (
              <View
                style={{
                  width: fillWidth * s,
                  height: h * s,
                  backgroundColor: color('fill'),
                }}
              />
            ) : null}
          </View>
        )}
        {enabled && (
          <View
            style={{
              position: 'absolute',
              left: thumbX * s,
              top: thumbTop * s,
            }}
          >
            {sprite && thumb ? (
              <SpriteCell image={sprite.image} at={thumb} size={[tw, th]} />
            ) : thumbColor ? (
              <View
                style={{
                  width: tw * s,
                  height: th * s,
                  backgroundColor: thumbColor,
                }}
              />
            ) : null}
          </View>
        )}
      </View>
    </View>
  )
}

import React, { type FC, useRef, useState } from 'react'
import { type GestureResponderEvent, StyleSheet, View } from 'react-native'

import type { ResolvedElement } from '@/bridge/generated'
import { useTransport } from '@/features/recorder/components/MainPanel/useTransport'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

import { seekGeometry } from './seekGeometry'
import { SeekPiece } from './SeekPiece'
import { thumbSize } from './thumbSize'

export type SkinSeekProps = {
  readonly element: ResolvedElement
}

/**
 * The seek bar (scrubber): the track, a fill up to the thumb and the thumb,
 * from the element's sprite cells (track, fill, thumb, thumbPressed,
 * thumbDisabled) or style colors (track, fill, thumb, thumbPressed). Drag
 * or click to seek the playback; it seeks when released.
 */
export const SkinSeek: FC<SkinSeekProps> = props => {
  const { element } = props
  // While dragging, onScrub gets the position under the pointer (undefined
  // when done); onSeek gets where dragging ended (or a click). Enabled
  // while something is loaded and can be scrubbed.
  const { seek } = useTransport()
  const { enabled, durationMs } = seek
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

  const progress = drag ?? (durationMs > 0 ? seek.positionMs / durationMs : 0)
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
    seek.onScrub(p * durationMs)
  }
  const release = () => {
    if (last.current != null) {
      seek.onSeek(last.current * durationMs)
    }
    last.current = undefined
    setDrag(undefined)
    seek.onScrub(undefined)
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
        style={[styles.origin, { width: w * s, height: h * s }]}
      >
        <SeekPiece
          sprite={sprite}
          at={track}
          size={[w, h]}
          color={color('track')}
        />
        {enabled && fillWidth > 0 && (
          <View style={styles.origin}>
            <SeekPiece
              sprite={sprite}
              at={fill}
              size={[fillWidth, h]}
              color={color('fill')}
            />
          </View>
        )}
        {enabled && (
          <View style={[styles.thumb, { left: thumbX * s, top: thumbTop * s }]}>
            <SeekPiece
              sprite={sprite}
              at={thumb}
              size={[tw, th]}
              color={thumbColor}
            />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', left: 0, top: 0 },
  thumb: { position: 'absolute' },
})

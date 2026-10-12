import React, { type FC, useLayoutEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

import type { ResolvedFont } from '@/bridge/generated'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'

const FLIP_MS = 260

export type FlipCellProps = {
  readonly font: ResolvedFont
  readonly at: readonly [number, number]
}

/**
 * One glyph cell that flips over like a split-flap clock card when its
 * glyph changes: the old glyph's top half folds down onto the middle,
 * then the new glyph's bottom half falls from the middle into place. The
 * font draws whole cards (each cell a card split across the middle).
 */
export const FlipCell: FC<FlipCellProps> = props => {
  const { font, at } = props
  const s = useSkinScale()
  const [cw, ch] = font.cell
  const [ax, ay] = at
  const key = cellKey(at)
  const [from, setFrom] = useState(at)
  const shown = useRef(key)
  const t = useRef(new Animated.Value(1)).current
  // A layout effect, so the flaps are reset before the new glyph paints.
  useLayoutEffect(() => {
    if (shown.current === key) {
      return
    }
    shown.current = key
    t.setValue(0)
    const run = Animated.timing(t, {
      toValue: 1,
      duration: FLIP_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false, // see Needle in LevelMeter
    })
    run.start(({ finished }) => {
      if (finished) {
        setFrom([ax, ay])
      }
    })
    return () => {
      // Interrupted by the next change: flip on from this glyph.
      run.stop()
      setFrom([ax, ay])
    }
  }, [ax, ay, key, t])
  const w = cw * s
  const h = ch * s
  const half = (glyph: readonly [number, number], bottom: boolean) => (
    <SpriteCell
      image={font.image}
      at={glyph}
      size={[cw, ch]}
      style={[styles.half, bottom && { top: -h / 2 }]}
    />
  )
  const clip = (top: number) => [styles.clip, { top, width: w, height: h / 2 }]
  // Scaling a half about its own center, shifted so its middle-of-card
  // edge stays put (a fold seen head on).
  const topFold = {
    transform: [
      {
        translateY: t.interpolate({
          inputRange: [0, 0.5],
          outputRange: [0, h / 4],
          extrapolate: 'clamp',
        }),
      },
      {
        scaleY: t.interpolate({
          inputRange: [0, 0.5],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  }
  const bottomFold = {
    transform: [
      {
        translateY: t.interpolate({
          inputRange: [0.5, 1],
          outputRange: [-h / 4, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        scaleY: t.interpolate({
          inputRange: [0.5, 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  }
  const shadow = (range: number[], to: number[]) => [
    styles.shadow,
    {
      width: w,
      height: h / 2,
      opacity: t.interpolate({
        inputRange: range,
        outputRange: to,
        extrapolate: 'clamp',
      }),
    },
  ]
  return (
    <View style={{ width: w, height: h }}>
      {/* Behind the flaps: the new top half and the old bottom half. */}
      <View style={clip(0)}>{half(at, false)}</View>
      <View style={clip(h / 2)}>{half(from, true)}</View>
      {key !== cellKey(from) && (
        <>
          <Animated.View style={[clip(0), topFold]}>
            {half(from, false)}
            <Animated.View style={shadow([0, 0.5], [0, 0.6])} />
          </Animated.View>
          <Animated.View style={[clip(h / 2), bottomFold]}>
            {half(at, true)}
            <Animated.View style={shadow([0.5, 1], [0.5, 0])} />
          </Animated.View>
        </>
      )}
    </View>
  )
}

const cellKey = (at: readonly [number, number]) =>
  `${String(at[0])},${String(at[1])}`

const styles = StyleSheet.create({
  half: { position: 'absolute', left: 0, top: 0 },
  clip: { position: 'absolute', left: 0, overflow: 'hidden' },
  shadow: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#000000',
  },
})

// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC, useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

export type NeedleProps = {
  readonly angle: number
  readonly left: number
  readonly face: readonly [number, number]
  readonly pivot: readonly [number, number]
  readonly length: number
  readonly width: number
  readonly color: string
  readonly tip: string
}

/** One needle meter's face: a needle easing to `angle`. */
export const Needle: FC<NeedleProps> = props => {
  const angle = useRef(new Animated.Value(props.angle)).current
  const target = useRef(props.angle)
  useEffect(() => {
    // Levels arrive about 10 times a second; ease between them, quicker
    // up than down like a meter's ballistics.
    const rising = props.angle > target.current
    target.current = props.angle
    Animated.timing(angle, {
      toValue: props.angle,
      duration: rising ? 120 : 240,
      easing: Easing.out(Easing.quad),
      // The JS driver: native-driven transforms don't update on macOS
      // (the needles sat still).
      useNativeDriver: false,
    }).start()
  }, [angle, props.angle])
  const { length, width } = props
  const rotate = angle.interpolate({
    inputRange: [-180, 180],
    outputRange: ['-180deg', '180deg'],
  })
  return (
    <View
      style={{
        position: 'absolute',
        left: props.left,
        top: 0,
        width: props.face[0],
        height: props.face[1],
        overflow: 'hidden',
      }}
    >
      {/* Twice the needle's length, centered on the pivot, so it turns
          about the pivot; only the top half is drawn. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: props.pivot[0] - width / 2,
          top: props.pivot[1] - length,
          width,
          height: length * 2,
          transform: [{ rotate }],
        }}
      >
        <View style={{ height: length * 0.2, backgroundColor: props.tip }} />
        <View style={{ height: length * 0.8, backgroundColor: props.color }} />
      </Animated.View>
    </View>
  )
}

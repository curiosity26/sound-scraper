/* eslint-disable react-native/no-inline-styles */

import React, { useRef } from 'react'
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'

import { Icon, type IconName } from './Icon'
import type { EditorTheme } from './types'

/**
 * A slider, 0..1, with an icon at each end (zoom). Horizontal by default;
 * `vertical` runs bottom (0) to top (1).
 */
export const Slider = (props: {
  th: EditorTheme
  value: number
  onChange: (value: number) => void
  label: string
  low: IconName
  high: IconName
  /** The track's length in points. */
  length?: number
  vertical?: boolean
  disabled?: boolean
}): React.JSX.Element => {
  const { th, vertical } = props
  const length = Math.max(20, props.length ?? 80)
  const track = useRef<View>(null)
  const origin = useRef(0)
  const measure = () =>
    track.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      origin.current = vertical ? pageY : pageX
    })
  const set = (e: GestureResponderEvent) => {
    const at = vertical ? e.nativeEvent.pageY : e.nativeEvent.pageX
    const t = (at - origin.current) / length
    props.onChange(Math.min(1, Math.max(0, vertical ? 1 - t : t)))
  }
  const v = Math.min(1, Math.max(0, props.value))
  const end = (which: 'low' | 'high') => (
    <Pressable
      accessibilityLabel={`${props.label}: ${
        which === 'low' ? 'less' : 'more'
      }`}
      onPress={() => {
        props.onChange(
          which === 'low' ? Math.max(0, v - 0.1) : Math.min(1, v + 0.1),
        )
      }}
      disabled={props.disabled}
      hitSlop={4}
    >
      <Icon name={props[which]} color={th.dim} size={10} />
    </Pressable>
  )
  return (
    <View
      style={[
        vertical ? styles.sliderV : styles.slider,
        { opacity: props.disabled ? 0.35 : 1 },
      ]}
    >
      {end(vertical ? 'high' : 'low')}
      <View
        ref={track}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={props.label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        style={
          vertical
            ? [styles.sliderTrackV, { height: length }]
            : [styles.sliderTrack, { width: length }]
        }
        onLayout={measure}
        onStartShouldSetResponder={() => !props.disabled}
        onMoveShouldSetResponder={() => !props.disabled}
        onResponderGrant={e => {
          // Re-measure: the window may have moved since layout.
          measure()
          set(e)
        }}
        onResponderMove={set}
        onResponderTerminationRequest={() => false}
      >
        <View
          style={[
            vertical ? styles.sliderRailV : styles.sliderRail,
            { backgroundColor: th.border },
          ]}
        />
        <View
          style={[
            vertical ? styles.sliderFillV : styles.sliderFill,
            vertical ? { height: v * length } : { width: v * length },
            { backgroundColor: th.accent },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            vertical ? { top: (1 - v) * length - 5 } : { left: v * length - 5 },
            { backgroundColor: th.text, borderColor: th.background },
          ]}
        />
      </View>
      {end(vertical ? 'low' : 'high')}
    </View>
  )
}

const styles = StyleSheet.create({
  slider: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sliderTrack: { height: 16, justifyContent: 'center' },
  sliderV: { alignItems: 'center', gap: 5 },
  sliderTrackV: { width: 16, alignItems: 'center' },
  sliderRailV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  sliderFillV: { position: 'absolute', bottom: 0, width: 3, borderRadius: 2 },
  sliderRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  sliderFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2 },
  sliderThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
})

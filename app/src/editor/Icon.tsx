/* eslint-disable react-native/no-inline-styles */

import React from 'react'
import { View } from 'react-native'

export type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'toStart'
  | 'magnet'
  | 'zoomOutH'
  | 'zoomInH'
  | 'zoomOutV'
  | 'zoomInV'

/** Simple shapes, sized `size` points, in `color`. */
export const Icon = (props: {
  name: IconName
  color: string
  size?: number
}): React.JSX.Element => {
  const s = props.size ?? 12
  const c = props.color
  const tri = (dir: 'left' | 'right', h: number) => ({
    width: 0,
    height: 0,
    borderTopWidth: h / 2,
    borderBottomWidth: h / 2,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    ...(dir === 'right'
      ? { borderLeftWidth: h * 0.85, borderLeftColor: c }
      : { borderRightWidth: h * 0.85, borderRightColor: c }),
  })
  const box = {
    width: s,
    height: s,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }
  switch (props.name) {
    case 'play':
      return (
        <View style={box}>
          <View style={[tri('right', s), { marginLeft: s * 0.15 }]} />
        </View>
      )
    case 'pause':
      return (
        <View style={[box, { flexDirection: 'row', gap: s * 0.22 }]}>
          <View
            style={{ width: s * 0.28, height: s * 0.9, backgroundColor: c }}
          />
          <View
            style={{ width: s * 0.28, height: s * 0.9, backgroundColor: c }}
          />
        </View>
      )
    case 'stop':
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.78,
              height: s * 0.78,
              backgroundColor: c,
              borderRadius: 1,
            }}
          />
        </View>
      )
    case 'toStart':
      return (
        <View style={[box, { flexDirection: 'row' }]}>
          <View
            style={{ width: s * 0.16, height: s * 0.85, backgroundColor: c }}
          />
          <View style={tri('left', s * 0.85)} />
        </View>
      )
    case 'magnet':
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.8,
              height: s * 0.8,
              borderWidth: s * 0.22,
              borderTopWidth: 0,
              borderColor: c,
              borderBottomLeftRadius: s * 0.4,
              borderBottomRightRadius: s * 0.4,
            }}
          />
        </View>
      )
    case 'zoomOutH':
    case 'zoomInH':
    case 'zoomOutV':
    case 'zoomInV': {
      const big = props.name === 'zoomInH' || props.name === 'zoomInV'
      const horizontal = props.name === 'zoomOutH' || props.name === 'zoomInH'
      const long = big ? s : s * 0.45
      return (
        <View style={box}>
          <View
            style={{
              width: horizontal ? long : s * 0.45,
              height: horizontal ? s * 0.45 : long,
              borderWidth: 1.5,
              borderColor: c,
              borderRadius: 1.5,
            }}
          />
        </View>
      )
    }
  }
}

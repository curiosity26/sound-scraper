import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

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

export type IconProps = {
  readonly name: IconName
  readonly color: string
  readonly size?: number
}

/** Simple shapes, sized `size` points, in `color`. */
export const Icon: FC<IconProps> = props => {
  const s = props.size ?? 12
  const c = props.color
  const tri = (dir: 'left' | 'right', h: number) => [
    styles.tri,
    { borderTopWidth: h / 2, borderBottomWidth: h / 2 },
    dir === 'right'
      ? { borderLeftWidth: h * 0.85, borderLeftColor: c }
      : { borderRightWidth: h * 0.85, borderRightColor: c },
  ]
  const box = [styles.box, { width: s, height: s }]
  switch (props.name) {
    case 'play':
      return (
        <View style={box}>
          <View style={[tri('right', s), { marginLeft: s * 0.15 }]} />
        </View>
      )
    case 'pause':
      return (
        <View style={[box, styles.row, { gap: s * 0.22 }]}>
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
            style={[
              { width: s * 0.78, height: s * 0.78, backgroundColor: c },
              styles.stop,
            ]}
          />
        </View>
      )
    case 'toStart':
      return (
        <View style={[box, styles.row]}>
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
            style={[
              {
                width: s * 0.8,
                height: s * 0.8,
                borderWidth: s * 0.22,
                borderColor: c,
                borderBottomLeftRadius: s * 0.4,
                borderBottomRightRadius: s * 0.4,
              },
              styles.magnet,
            ]}
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
            style={[
              {
                width: horizontal ? long : s * 0.45,
                height: horizontal ? s * 0.45 : long,
                borderColor: c,
              },
              styles.zoom,
            ]}
          />
        </View>
      )
    }
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  tri: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  stop: { borderRadius: 1 },
  magnet: { borderTopWidth: 0 },
  zoom: { borderWidth: 1.5, borderRadius: 1.5 },
})

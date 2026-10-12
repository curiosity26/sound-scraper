import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { Glyph } from './Glyph'

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

/** The transport's glyphs (Material Icons) and simple drawn shapes, sized
 * `size` points, in `color`. */
export const Icon: FC<IconProps> = props => {
  const s = props.size ?? 12
  const c = props.color
  const box = [styles.box, { width: s, height: s }]
  switch (props.name) {
    case 'play':
    case 'pause':
    case 'stop':
    case 'toStart':
      return <Glyph name={props.name} color={c} size={s} />
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
  magnet: { borderTopWidth: 0 },
  zoom: { borderWidth: 1.5, borderRadius: 1.5 },
})

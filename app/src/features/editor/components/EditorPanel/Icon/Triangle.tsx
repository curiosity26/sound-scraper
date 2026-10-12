import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

export type TriangleProps = {
  /** Which way the point faces. */
  readonly pointing: 'left' | 'right'
  /** The height of the flat side; the triangle is 0.85 of that wide. */
  readonly height: number
  readonly color: string
}

/** How far the point is from the flat side, for each point of its height. */
const DEPTH = 0.85

/**
 * A triangle with its flat side upright. Drawn as a diamond (a turned
 * square, stretched) half clipped away, because React Native Windows fills
 * a border's corners solid, so the zero-size view with one colored border
 * that makes a triangle elsewhere is a rectangle there.
 */
export const Triangle: FC<TriangleProps> = props => {
  const h = props.height
  const width = h * DEPTH
  // A square whose diagonal is the flat side, centered on it.
  const side = h / Math.SQRT2
  return (
    <View style={[styles.clip, { width, height: h }]}>
      <View
        style={[
          styles.diamond,
          {
            width: side,
            height: side,
            top: (h - side) / 2,
            left: (props.pointing === 'right' ? 0 : width) - side / 2,
            backgroundColor: props.color,
            // Turned, then stretched so the point lands `width` away.
            transform: [{ scaleX: DEPTH * 2 }, { rotate: '45deg' }],
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  diamond: { position: 'absolute' },
})

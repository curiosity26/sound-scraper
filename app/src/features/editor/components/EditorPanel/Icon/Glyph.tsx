import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { platformText } from '@/shared/platformText'

/** Material Icons' code points for the glyphs the editor uses. */
const CODE_POINTS = {
  play: 0xe037,
  pause: 0xe034,
  stop: 0xe047,
  toStart: 0xe045,
} as const

export type GlyphName = keyof typeof CODE_POINTS

export type GlyphProps = {
  readonly name: GlyphName
  readonly color: string
  /** The icon's box; the glyph is drawn a little larger, since Material
   * Icons leave a margin inside each glyph. */
  readonly size: number
}

/**
 * A Material Icons glyph, centered on a `size` box: the text gets a frame
 * one font size square, overhanging the box evenly. The font's line is
 * exactly one em with each glyph centered in it, so no line height is set
 * (React Native Windows would put its baseline at 80% of a set one).
 */
export const Glyph: FC<GlyphProps> = props => {
  const fontSize = Math.round(props.size * 1.5)
  return (
    <Text
      accessible={false}
      style={[
        styles.glyph,
        {
          color: props.color,
          fontSize,
          width: fontSize,
          height: fontSize,
          margin: (props.size - fontSize) / 2,
        },
      ]}
    >
      {String.fromCodePoint(CODE_POINTS[props.name])}
    </Text>
  )
}

const styles = StyleSheet.create({
  glyph: {
    fontFamily: platformText.iconFont,
    textAlign: 'center',
    includeFontPadding: false,
  },
})

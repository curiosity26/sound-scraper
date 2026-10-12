import type { FC } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

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
 * A Material Icons glyph, centered in a `size` box. The font's line is
 * exactly one em (ascent 512, descent 0, no gap) with each glyph centered
 * in it. macOS and Linux center it when the line height is the font size;
 * React Native Windows puts a set line height's baseline at 80% of it,
 * lifting the glyph, so there the natural line height is kept.
 */
const glyphSize = (fontSize: number) =>
  Platform.OS === 'windows' ? { fontSize } : { fontSize, lineHeight: fontSize }

export const Glyph: FC<GlyphProps> = props => (
  <View style={[styles.box, { width: props.size, height: props.size }]}>
    <Text
      accessible={false}
      style={[
        styles.glyph,
        { color: props.color, ...glyphSize(Math.round(props.size * 1.5)) },
      ]}
    >
      {String.fromCodePoint(CODE_POINTS[props.name])}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  glyph: {
    fontFamily: platformText.iconFont,
    textAlign: 'center',
    includeFontPadding: false,
  },
})

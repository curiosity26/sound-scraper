import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

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
 * in it, so the text's natural height centers it; a set lineHeight shifts
 * the baseline differently on each platform.
 */
export const Glyph: FC<GlyphProps> = props => (
  <View style={[styles.box, { width: props.size, height: props.size }]}>
    <Text
      accessible={false}
      style={[
        styles.glyph,
        { color: props.color, fontSize: Math.round(props.size * 1.5) },
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

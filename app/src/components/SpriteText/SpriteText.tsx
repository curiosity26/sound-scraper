// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC, useEffect, useState } from 'react'
import { View } from 'react-native'

import { SpriteCell } from '@/components/SpriteCell'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { SpriteFont } from '@/skin/types'

import { FlipCell } from './FlipCell'
import { layoutCells } from './layoutCells'
import { toGlyphs } from './toGlyphs'

export type SpriteTextProps = {
  readonly font: SpriteFont
  readonly text: string
  /** Field width in points; the text never draws outside it. */
  readonly width: number
  readonly align?: 'left' | 'center' | 'right'
  readonly pad?: boolean
  /** Scroll text that doesn't fit (default true). */
  readonly marquee?: boolean
  /** Animate changed cells like split-flap cards (see FlipCell). */
  readonly flip?: boolean
}

/** Text drawn with a sprite (bitmap) font. */
export const SpriteText: FC<SpriteTextProps> = props => {
  const { font, text, width, align = 'left', pad = false } = props
  const s = useSkinScale()
  const [cw, ch] = font.cell
  const capacity = Math.max(0, Math.floor(width / (cw * s)))
  const chars = toGlyphs(text, font.glyphs)
  const scrolls = props.marquee !== false && chars.length > capacity
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    setOffset(0)
    if (!scrolls) {
      return
    }
    const timer = setInterval(() => {
      setOffset(o => o + 1)
    }, 280)
    return () => {
      clearInterval(timer)
    }
  }, [scrolls, text])
  const cells = layoutCells(chars, capacity, align, pad, scrolls ? offset : 0)
  const glyphs = Array.from(font.glyphs)
  return (
    <View
      accessible
      accessibilityLabel={text}
      pointerEvents="none"
      style={{
        flexDirection: 'row',
        width,
        height: ch * s,
        overflow: 'hidden',
      }}
    >
      {cells.map((c, i) => {
        const index = glyphs.indexOf(c)
        if (index < 0) {
          return <View key={i} style={{ width: cw * s, height: ch * s }} />
        }
        const at = glyphAt(font, index)
        return props.flip ? (
          <FlipCell key={i} font={font} at={at} />
        ) : (
          <SpriteCell key={i} image={font.image} at={at} size={[cw, ch]} />
        )
      })}
    </View>
  )
}

const glyphAt = (font: SpriteFont, index: number): [number, number] => {
  const [cw, ch] = font.cell
  return [(index % font.columns) * cw, Math.floor(index / font.columns) * ch]
}

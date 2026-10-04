// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SpriteCell } from './SkinImage';
import type { SkinElement, SpriteFont } from './types';

/**
 * Maps `text` onto a font's glyphs: accents are dropped, lowercase falls
 * back to uppercase, and anything else missing becomes "?" (or a space).
 */
export function toGlyphs(text: string, glyphs: string): string[] {
  const available = new Set(Array.from(glyphs));
  const unknown = available.has('?') ? '?' : ' ';
  return Array.from(text.normalize('NFD').replace(/[̀-ͯ]/g, '')).map(
    c => {
      if (available.has(c)) {
        return c;
      }
      const upper = c.toUpperCase();
      return available.has(upper) ? upper : unknown;
    },
  );
}

/**
 * The cells to draw in a `capacity`-cell field: aligned, padded with spaces
 * when `pad` (to show a font's unlit cells), and scrolled by `offset` when
 * too long (a marquee, joined with a gap).
 */
export function layoutCells(
  chars: string[],
  capacity: number,
  align: 'left' | 'center' | 'right',
  pad: boolean,
  offset: number,
): string[] {
  if (chars.length > capacity) {
    const loop = [...chars, ' ', ' ', ' ', ' '];
    return Array.from(
      { length: capacity },
      (_, i) => loop[(offset + i) % loop.length],
    );
  }
  const free = capacity - chars.length;
  const before =
    align === 'right' ? free : align === 'center' ? Math.floor(free / 2) : 0;
  const after = free - before;
  const space = (n: number) => Array.from({ length: n }, () => ' ');
  return pad || before > 0
    ? [...space(before), ...chars, ...(pad ? space(after) : [])]
    : chars;
}

type Props = {
  font: SpriteFont;
  text: string;
  /** Field width in points; the text never draws outside it. */
  width: number;
  align?: 'left' | 'center' | 'right';
  pad?: boolean;
  /** Scroll text that doesn't fit (default true). */
  marquee?: boolean;
};

/** Text drawn with a sprite (bitmap) font. */
export function SpriteText(props: Props): React.JSX.Element {
  const { font, text, width, align = 'left', pad = false } = props;
  const [cw, ch] = font.cell;
  const capacity = Math.max(0, Math.floor(width / cw));
  const chars = toGlyphs(text, font.glyphs);
  const scrolls = props.marquee !== false && chars.length > capacity;
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
    if (!scrolls) {
      return;
    }
    const timer = setInterval(() => setOffset(o => o + 1), 280);
    return () => clearInterval(timer);
  }, [scrolls, text]);
  const cells = layoutCells(chars, capacity, align, pad, scrolls ? offset : 0);
  const glyphs = Array.from(font.glyphs);
  return (
    <View
      accessible
      accessibilityLabel={text}
      pointerEvents="none"
      style={{ flexDirection: 'row', width, height: ch, overflow: 'hidden' }}
    >
      {cells.map((c, i) => {
        const index = glyphs.indexOf(c);
        if (index < 0) {
          return <View key={i} style={{ width: cw, height: ch }} />;
        }
        return (
          <SpriteCell
            key={i}
            image={font.image}
            at={[(index % font.columns) * cw, Math.floor(index / font.columns) * ch]}
            size={[cw, ch]}
          />
        );
      })}
    </View>
  );
}

/**
 * An element's text: its sprite font if it has one, else system text in
 * the element's text style. Positioned at the element's rect.
 */
export function ElementText(props: {
  element: SkinElement;
  fonts: Record<string, SpriteFont>;
  text: string;
  testID?: string;
}): React.JSX.Element {
  const { element, fonts } = props;
  const [x, y, w, h] = element.rect;
  const font = element.font ? fonts[element.font] : undefined;
  const pad = element.style?.pad === true;
  const align = element.align ?? 'left';
  const t = element.text;
  return (
    <View
      testID={props.testID}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        justifyContent: 'center',
      }}
    >
      {font ? (
        <SpriteText
          font={font}
          text={props.text}
          width={w}
          align={align}
          pad={pad}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            color: t?.color ?? '#ffffff',
            fontSize: t?.size ?? Math.max(8, h * 0.7),
            fontFamily: t?.family ?? undefined,
            fontWeight: t?.weight === 'bold' ? '700' : '400',
            textAlign: align,
            fontVariant: ['tabular-nums'],
          }}
        >
          {t?.uppercase ? props.text.toUpperCase() : props.text}
        </Text>
      )}
    </View>
  );
}

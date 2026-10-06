// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { scaleRect, SpriteCell, useSkinScale } from './SkinImage';
import type { SkinElement, SpriteFont } from './types';

/**
 * Maps `text` onto a font's glyphs: accents are dropped, lowercase falls
 * back to uppercase, and anything else missing becomes "?" (or a space).
 */
export function toGlyphs(text: string, glyphs: string): string[] {
  const available = new Set(Array.from(glyphs));
  const unknown = available.has('?') ? '?' : ' ';
  return Array.from(text.normalize('NFD').replace(/[̀-ͯ]/g, '')).map(c => {
    if (available.has(c)) {
      return c;
    }
    const upper = c.toUpperCase();
    return available.has(upper) ? upper : unknown;
  });
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
  /** Animate changed cells like split-flap cards (see FlipCell). */
  flip?: boolean;
};

/** Text drawn with a sprite (bitmap) font. */
export function SpriteText(props: Props): React.JSX.Element {
  const { font, text, width, align = 'left', pad = false } = props;
  const s = useSkinScale();
  const [cw, ch] = font.cell;
  const capacity = Math.max(0, Math.floor(width / (cw * s)));
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
      style={{
        flexDirection: 'row',
        width,
        height: ch * s,
        overflow: 'hidden',
      }}
    >
      {cells.map((c, i) => {
        const index = glyphs.indexOf(c);
        if (index < 0) {
          return <View key={i} style={{ width: cw * s, height: ch * s }} />;
        }
        const at = glyphAt(font, index);
        return props.flip ? (
          <FlipCell key={i} font={font} at={at} />
        ) : (
          <SpriteCell key={i} image={font.image} at={at} size={[cw, ch]} />
        );
      })}
    </View>
  );
}

function glyphAt(font: SpriteFont, index: number): [number, number] {
  const [cw, ch] = font.cell;
  return [(index % font.columns) * cw, Math.floor(index / font.columns) * ch];
}

const FLIP_MS = 260;

/**
 * One glyph cell that flips over like a split-flap clock card when its
 * glyph changes: the old glyph's top half folds down onto the middle,
 * then the new glyph's bottom half falls from the middle into place. The
 * font draws whole cards (each cell a card split across the middle).
 */
function FlipCell(props: { font: SpriteFont; at: [number, number] }) {
  const { font, at } = props;
  const s = useSkinScale();
  const [cw, ch] = font.cell;
  const key = `${at[0]},${at[1]}`;
  const [from, setFrom] = useState(at);
  const shown = useRef(key);
  const t = useRef(new Animated.Value(1)).current;
  // A layout effect, so the flaps are reset before the new glyph paints.
  useLayoutEffect(() => {
    if (shown.current === key) {
      return;
    }
    shown.current = key;
    t.setValue(0);
    const run = Animated.timing(t, {
      toValue: 1,
      duration: FLIP_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false, // see Needle in LevelMeter
    });
    run.start(({ finished }) => finished && setFrom(at));
    return () => {
      // Interrupted by the next change: flip on from this glyph.
      run.stop();
      setFrom(at);
    };
    // `at` changes with `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t]);
  const w = cw * s;
  const h = ch * s;
  const half = (glyph: [number, number], bottom: boolean) => (
    <SpriteCell
      image={font.image}
      at={glyph}
      size={[cw, ch]}
      style={{ position: 'absolute', left: 0, top: bottom ? -h / 2 : 0 }}
    />
  );
  const clip = (top: number) => ({
    position: 'absolute' as const,
    left: 0,
    top,
    width: w,
    height: h / 2,
    overflow: 'hidden' as const,
  });
  // Scaling a half about its own center, shifted so its middle-of-card
  // edge stays put (a fold seen head on).
  const topFold = {
    transform: [
      {
        translateY: t.interpolate({
          inputRange: [0, 0.5],
          outputRange: [0, h / 4],
          extrapolate: 'clamp',
        }),
      },
      {
        scaleY: t.interpolate({
          inputRange: [0, 0.5],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  const bottomFold = {
    transform: [
      {
        translateY: t.interpolate({
          inputRange: [0.5, 1],
          outputRange: [-h / 4, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        scaleY: t.interpolate({
          inputRange: [0.5, 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  const shadow = (range: number[], to: number[]) => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: w,
    height: h / 2,
    backgroundColor: '#000000',
    opacity: t.interpolate({
      inputRange: range,
      outputRange: to,
      extrapolate: 'clamp',
    }),
  });
  return (
    <View style={{ width: w, height: h }}>
      {/* Behind the flaps: the new top half and the old bottom half. */}
      <View style={clip(0)}>{half(at, false)}</View>
      <View style={clip(h / 2)}>{half(from, true)}</View>
      {key !== `${from[0]},${from[1]}` && (
        <>
          <Animated.View style={[clip(0), topFold]}>
            {half(from, false)}
            <Animated.View style={shadow([0, 0.5], [0, 0.6])} />
          </Animated.View>
          <Animated.View style={[clip(h / 2), bottomFold]}>
            {half(at, true)}
            <Animated.View style={shadow([0.5, 1], [0.5, 0])} />
          </Animated.View>
        </>
      )}
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
  const s = useSkinScale();
  const [, , w, h] = element.rect;
  const font = element.font ? fonts[element.font] : undefined;
  const pad = element.style?.pad === true;
  const align = element.align ?? 'left';
  const t = element.text;
  return (
    <View
      testID={props.testID}
      pointerEvents="none"
      style={[scaleRect(element.rect, s), { justifyContent: 'center' }]}
    >
      {font ? (
        <SpriteText
          font={font}
          text={props.text}
          width={w * s}
          align={align}
          pad={pad}
          flip={element.style?.flip === true}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            color: t?.color ?? '#ffffff',
            fontSize: (t?.size ?? Math.max(8, h * 0.7)) * s,
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

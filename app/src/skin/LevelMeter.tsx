// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { View } from 'react-native';

import { SpriteCell } from './SkinImage';
import type { SkinElement } from './types';

/** Maps a linear level to 0..1 over a 60 dB range. */
export function meterScale(level: number): number {
  if (level <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (20 * Math.log10(level) + 60) / 60));
}

type Props = {
  element: SkinElement;
  /** Linear 0..1. */
  peak: number;
  rms: number;
};

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' ? v : fallback;

/**
 * The level meter. With a sprite, its "on" cell is revealed over the "off"
 * cell up to the level. Otherwise it draws segments from the style: rows
 * (1 = peak; 2 = peak and average), segments, gap, vertical, and the on, hot
 * (top 30%), clip (top 10%) and off colors.
 */
export function LevelMeter(props: Props): React.JSX.Element {
  const { element } = props;
  const [x, y, w, h] = element.rect;
  const box = { position: 'absolute' as const, left: x, top: y, width: w, height: h };
  const peak = meterScale(props.peak);
  const sprite = element.sprite;
  if (sprite) {
    const vertical = h > w;
    const reveal = vertical ? Math.round(h * peak) : Math.round(w * peak);
    const cell = (state: string) => sprite.states[state];
    return (
      <View testID="levels" pointerEvents="none" style={[box, { overflow: 'hidden' }]}>
        <Cell element={element} at={cell('off')} />
        <View
          style={{
            position: 'absolute',
            overflow: 'hidden',
            left: 0,
            bottom: 0,
            width: vertical ? w : reveal,
            height: vertical ? reveal : h,
          }}
        >
          <View style={{ position: 'absolute', left: 0, bottom: 0, width: w, height: h }}>
            <Cell element={element} at={cell('on')} />
          </View>
        </View>
      </View>
    );
  }
  const s = element.style ?? {};
  const rows = Math.min(2, Math.max(1, num(s.rows, 1)));
  const segments = Math.max(1, num(s.segments, 20));
  const gap = Math.max(0, num(s.gap, 1));
  const vertical = s.vertical === true;
  const on = color(s.on, '#9fd630');
  const hot = color(s.hot, on);
  const clip = color(s.clip, hot);
  const off = color(s.off, '#00000033');
  const levels = rows === 2 ? [peak, meterScale(props.rms)] : [peak];
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const rowSize = (across - gap * (rows - 1)) / rows;
  const segSize = (along - gap * (segments - 1)) / segments;
  return (
    <View testID="levels" pointerEvents="none" style={box}>
      {levels.map((level, row) =>
        Array.from({ length: segments }, (_, i) => {
          const lit = i < Math.round(level * segments);
          const fill = !lit
            ? off
            : i >= segments * 0.9
            ? clip
            : i >= segments * 0.7
            ? hot
            : on;
          const a = i * (segSize + gap);
          const b = row * (rowSize + gap);
          return (
            <View
              key={`${row}-${i}`}
              style={{
                position: 'absolute',
                backgroundColor: fill,
                left: vertical ? b : a,
                top: vertical ? along - a - segSize : b,
                width: vertical ? rowSize : segSize,
                height: vertical ? segSize : rowSize,
              }}
            />
          );
        }),
      )}
    </View>
  );
}

function Cell(props: { element: SkinElement; at: [number, number] }) {
  const { element } = props;
  return (
    <SpriteCell
      image={element.sprite!.image}
      at={props.at}
      size={[element.rect[2], element.rect[3]]}
    />
  );
}

/**
 * Where the visualizer will draw (phase 2: a native view fed by the Rust
 * analyzer). For now: the style's grid and a flat line.
 */
export function VisualizerPlaceholder(props: { element: SkinElement }) {
  const [x, y, w, h] = props.element.rect;
  const s = props.element.style ?? {};
  const grid = color(s.grid, '#ffffff1a');
  const line = color(s.line, '#9fd630');
  return (
    <View
      testID="visualizer"
      pointerEvents="none"
      style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
    >
      {Array.from({ length: Math.floor(w / 8) + 1 }, (_, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: i * 8, top: 0, width: 1, height: h, backgroundColor: grid }}
        />
      ))}
      <View
        style={{ position: 'absolute', left: 0, top: Math.floor(h / 2), width: w, height: 1, backgroundColor: line }}
      />
    </View>
  );
}

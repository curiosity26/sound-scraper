// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { scaleRect, useSkinScale } from './SkinImage';
import { VisualizerPlaceholder } from './LevelMeter';
import VisualizerNative from './VisualizerNative';
import type { SkinElement } from './types';

// The native view: SSVisualizerView.mm on macOS, VisualizerView.h on
// Windows. It draws the Rust core's live analysis every display refresh
// while recording, the preset's idle look otherwise.
const SSVisualizerView = VisualizerNative;

// The chosen look, shared by the main and shade layouts.
let chosenPreset = 0;
const listeners = new Set<(i: number) => void>();

/** Picks the next preset, wrapping around. */
export function nextPreset(index: number, count: number): number {
  return count > 0 ? (index + 1) % count : 0;
}

/**
 * The visualizer element. Click it to cycle the skin's presets. The
 * element's style supplies idle-look colors (grid, line) presets lack, and
 * `pixelated` (default true) for the hard-edged LCD look.
 */
export function Visualizer(props: {
  element: SkinElement;
  presets: Array<Record<string, unknown>>;
}): React.JSX.Element {
  const { element, presets } = props;
  const s = useSkinScale();
  const [index, setIndex] = useState(chosenPreset);
  useEffect(() => {
    listeners.add(setIndex);
    return () => {
      listeners.delete(setIndex);
    };
  }, []);
  const style = element.style ?? {};
  const preset = presets.length > 0 ? presets[index % presets.length] : {};
  // Strings compare by value, so the native view only re-applies real changes.
  const json = JSON.stringify({
    grid: style.grid,
    line: style.line,
    ...preset,
  });
  const cycle = () => {
    chosenPreset = nextPreset(chosenPreset, presets.length);
    listeners.forEach(l => l(chosenPreset));
  };
  const name = typeof preset.name === 'string' ? preset.name : 'Visualizer';
  return (
    <Pressable
      testID="visualizer"
      accessibilityRole="button"
      accessibilityLabel={`Visualizer: ${name}. Click for the next look.`}
      onPress={cycle}
      style={scaleRect(element.rect, s)}
    >
      {SSVisualizerView ? (
        <SSVisualizerView
          style={{ flex: 1 }}
          preset={json}
          pixelated={style.pixelated !== false}
          skinScale={s}
        />
      ) : (
        <VisualizerPlaceholder
          element={{
            ...element,
            rect: [0, 0, element.rect[2], element.rect[3]],
          }}
        />
      )}
    </Pressable>
  );
}

// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useRef } from 'react';
import { type GestureResponderEvent, View } from 'react-native';

import { NineSlice } from './NineSlice';
import { SpriteCell } from './SkinImage';
import type { ImageRef, Rect } from './types';

type Props = {
  image: ImageRef;
  /** Track and thumb cells in `image`. */
  track: Rect;
  thumb: Rect;
  /** Optional [top, right, bottom, left] insets for stretching the track. */
  trackSlice?: [number, number, number, number];
  width: number;
  height: number;
  /** 0..1 */
  value: number;
  onChange: (value: number) => void;
  /** Called when dragging ends. */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * A slider drawn from sprites: the track stretched to the slider's size and
 * the thumb at the value. Vertical when taller than wide (0 at the bottom).
 */
export function SkinSlider(props: Props): React.JSX.Element {
  const { image, track, thumb, width, height, disabled } = props;
  const vertical = height > width;
  const thumbLength = vertical ? thumb[3] : thumb[2];
  const travel = Math.max(0, (vertical ? height : width) - thumbLength);
  const value = Math.min(1, Math.max(0, props.value));
  const last = useRef(value);

  const valueAt = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const pos = vertical
      ? height - locationY - thumbLength / 2
      : locationX - thumbLength / 2;
    return travel > 0 ? Math.min(1, Math.max(0, pos / travel)) : 0;
  };
  const move = (e: GestureResponderEvent) => {
    last.current = valueAt(e);
    props.onChange(last.current);
  };

  const thumbPos = vertical ? travel * (1 - value) : travel * value;
  return (
    <View
      testID={props.testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ width, height, opacity: disabled ? 0.5 : 1 }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={move}
      onResponderMove={move}
      onResponderRelease={() => props.onCommit?.(last.current)}
    >
      <View pointerEvents="none" style={{ position: 'absolute' }}>
        {props.trackSlice ? (
          <NineSlice
            image={image}
            source={track}
            slice={props.trackSlice}
            width={width}
            height={height}
          />
        ) : (
          <SpriteCell
            image={image}
            at={[track[0], track[1]]}
            size={[track[2], track[3]]}
            drawSize={[width, height]}
          />
        )}
      </View>
      <SpriteCell
        image={image}
        at={[thumb[0], thumb[1]]}
        size={[thumb[2], thumb[3]]}
        style={{
          position: 'absolute',
          left: vertical ? (width - thumb[2]) / 2 : thumbPos,
          top: vertical ? thumbPos : (height - thumb[3]) / 2,
        }}
      />
    </View>
  );
}

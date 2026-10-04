// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { SpriteCell } from './SkinImage';
import type { ImageRef, Rect } from './types';

type Props = {
  image: ImageRef;
  /** [top, right, bottom, left] insets that keep their size. */
  slice: [number, number, number, number];
  /** The part of `image` to use (a sprite cell); defaults to all of it. */
  source?: Rect;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Draws `image` as a nine-slice frame of width × height: corners keep their
 * size, edges stretch along one axis and the center along both. Children
 * are laid out on top, inside the insets.
 */
export function NineSlice(props: Props): React.JSX.Element {
  const { image, width, height } = props;
  const [t, r, b, l] = props.slice;
  const [ox, oy, iw, ih] = props.source ?? [0, 0, image.width, image.height];
  const cols: Array<[number, number, number, number]> = [
    // [source x, source width, dest x, dest width]
    [0, l, 0, l],
    [l, iw - l - r, l, width - l - r],
    [iw - r, r, width - r, r],
  ];
  const rows: Array<[number, number, number, number]> = [
    [0, t, 0, t],
    [t, ih - t - b, t, height - t - b],
    [ih - b, b, height - b, b],
  ];
  const pieces = [];
  for (const [sy, sh, dy, dh] of rows) {
    for (const [sx, sw, dx, dw] of cols) {
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
        pieces.push(
          <SpriteCell
            key={`${sx},${sy}`}
            image={image}
            at={[ox + sx, oy + sy]}
            size={[sw, sh]}
            drawSize={[dw, dh]}
            style={{ position: 'absolute', left: dx, top: dy }}
          />,
        );
      }
    }
  }
  return (
    <View style={[{ width, height }, props.style]}>
      {pieces}
      <View
        style={{
          position: 'absolute',
          left: l,
          top: t,
          right: r,
          bottom: b,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { SpriteCell, useSkinScale } from './SkinImage';
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
  const s = useSkinScale();
  const [t, r, b, l] = props.slice;
  // Corners keep their (scaled) size.
  const [dt, dr, db, dl] = [t * s, r * s, b * s, l * s];
  const [ox, oy, iw, ih] = props.source ?? [0, 0, image.width, image.height];
  const cols: Array<[number, number, number, number]> = [
    // [source x, source width, dest x, dest width]
    [0, l, 0, dl],
    [l, iw - l - r, dl, width - dl - dr],
    [iw - r, r, width - dr, dr],
  ];
  const rows: Array<[number, number, number, number]> = [
    [0, t, 0, dt],
    [t, ih - t - b, dt, height - dt - db],
    [ih - b, b, height - db, db],
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
          left: dl,
          top: dt,
          right: dr,
          bottom: db,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

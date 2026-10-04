// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {
  Image,
  type ImageStyle,
  PixelRatio,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import type { ImageRef } from './types';

/** The skin image for this display: the @2x file on Retina when there is one. */
export function imageSource(image: ImageRef, pixelRatio = PixelRatio.get()) {
  const retina = pixelRatio >= 1.5 && image.path2x != null;
  return {
    uri: fileUri(retina ? image.path2x! : image.path),
    width: image.width,
    height: image.height,
    scale: retina ? 2 : 1,
  };
}

export function fileUri(path: string): string {
  return `file://${encodeURI(path).replace(/[?#]/g, encodeURIComponent)}`;
}

type Props = {
  image: ImageRef;
  /** Drawn size; defaults to the image's size. */
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
};

/** A skin image at its point size (or stretched to width × height). */
export function SkinImage(props: Props): React.JSX.Element {
  const { image } = props;
  return (
    <Image
      source={imageSource(image)}
      resizeMode="stretch"
      fadeDuration={0}
      style={[
        {
          width: props.width ?? image.width,
          height: props.height ?? image.height,
        },
        props.style,
      ]}
    />
  );
}

type CellProps = {
  image: ImageRef;
  /** Top-left of the cell in the image. */
  at: [number, number];
  /** Cell size in the image. */
  size: [number, number];
  /** Drawn size; defaults to the cell size (larger stretches it). */
  drawSize?: [number, number];
  style?: StyleProp<ViewStyle>;
};

/** One cell of a sprite sheet. */
export function SpriteCell(props: CellProps): React.JSX.Element {
  const { image, at, size } = props;
  const [w, h] = props.drawSize ?? size;
  const kx = w / size[0];
  const ky = h / size[1];
  return (
    <View
      pointerEvents="none"
      style={[{ width: w, height: h, overflow: 'hidden' }, props.style]}
    >
      <SkinImage
        image={image}
        width={image.width * kx}
        height={image.height * ky}
        style={{ position: 'absolute', left: -at[0] * kx, top: -at[1] * ky }}
      />
    </View>
  );
}

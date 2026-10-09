// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { createContext, useContext } from 'react'
import {
  Image,
  type ImageStyle,
  PixelRatio,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'

import type { ImageRef, Rect } from './types'

/** How many points one skin point takes: 1, or 2 in double-size mode. */
export const SkinScale = createContext(1)
export const useSkinScale = () => useContext(SkinScale)

export function scaleRect(rect: Rect, s: number) {
  return {
    position: 'absolute' as const,
    left: rect[0] * s,
    top: rect[1] * s,
    width: rect[2] * s,
    height: rect[3] * s,
  }
}

/**
 * The skin image file for `density` device pixels per skin point (screen
 * scale × skin scale): @4x, @2x or 1x, the smallest that's sharp enough.
 */
export function imageSource(image: ImageRef, density = PixelRatio.get()) {
  const [path, scale] =
    density > 2 && image.path4x != null
      ? [image.path4x, 4]
      : density >= 1.5 && image.path2x != null
      ? [image.path2x, 2]
      : [image.path, 1]
  return {
    uri: fileUri(path),
    width: image.width,
    height: image.height,
    scale,
  }
}

let revision = ''

/**
 * The current skin's revision, added to image URLs so the image cache
 * doesn't keep a skin folder's old pictures after they're edited.
 */
export function setImageRevision(r: string) {
  revision = r
}

/** A file URL for a macOS (/…) or Windows (C:\…) path. */
export function fileUri(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  const encoded = encodeURI(slashed).replace(/[?#]/g, encodeURIComponent)
  const url = slashed.startsWith('/')
    ? `file://${encoded}`
    : `file:///${encoded}`
  return revision ? `${url}?v=${encodeURIComponent(revision)}` : url
}

type Props = {
  image: ImageRef
  /** Drawn size; defaults to the image's size. */
  width?: number
  height?: number
  style?: StyleProp<ImageStyle>
}

/** A skin image at its (scaled) point size, or stretched to width × height. */
export function SkinImage(props: Props): React.JSX.Element {
  const { image } = props
  const s = useSkinScale()
  return (
    <Image
      source={imageSource(image, PixelRatio.get() * s)}
      resizeMode="stretch"
      fadeDuration={0}
      style={[
        {
          width: props.width ?? image.width * s,
          height: props.height ?? image.height * s,
        },
        props.style,
      ]}
    />
  )
}

type CellProps = {
  image: ImageRef
  /** Top-left of the cell in the image. */
  at: [number, number]
  /** Cell size in the image. */
  size: [number, number]
  /** Drawn size; defaults to the cell size × the skin scale. */
  drawSize?: [number, number]
  style?: StyleProp<ViewStyle>
}

/** One cell of a sprite sheet. */
export function SpriteCell(props: CellProps): React.JSX.Element {
  const { image, at, size } = props
  const s = useSkinScale()
  const [w, h] = props.drawSize ?? [size[0] * s, size[1] * s]
  const kx = w / size[0]
  const ky = h / size[1]
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
  )
}

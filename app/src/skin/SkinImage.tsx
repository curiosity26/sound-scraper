// Layout here comes from skin data (rects, sizes), so styles are inline.

import React, { type FC } from 'react'
import {
  Image,
  type ImageStyle,
  PixelRatio,
  type StyleProp,
} from 'react-native'

import { imageSource } from './imageSource'
import type { ImageRef } from './types'
import { useSkinScale } from './useSkinScale'

export type SkinImageProps = {
  readonly image: ImageRef
  /** Drawn size; defaults to the image's size. */
  readonly width?: number
  readonly height?: number
  readonly style?: StyleProp<ImageStyle>
}

/** A skin image at its (scaled) point size, or stretched to width × height. */
export const SkinImage: FC<SkinImageProps> = props => {
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

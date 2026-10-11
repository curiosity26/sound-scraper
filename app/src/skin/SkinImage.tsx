// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react'
import { Image, type ImageStyle, PixelRatio, type StyleProp } from 'react-native'

import { imageSource } from './imageSource'
import type { ImageRef } from './types'
import { useSkinScale } from './useSkinScale'

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

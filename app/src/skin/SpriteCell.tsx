// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import { SkinImage } from './SkinImage'
import type { ImageRef } from './types'
import { useSkinScale } from './useSkinScale'

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
export const SpriteCell = (props: CellProps): React.JSX.Element => {
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

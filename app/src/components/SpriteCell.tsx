// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import { useSkinScale } from '@/hooks/useSkinScale'
import type { ImageRef } from '@/native/bridge'

import { SkinImage } from './SkinImage'

export type SpriteCellProps = {
  readonly image: ImageRef
  /**
   * Top-left of the cell in the image; undefined (a state the sprite
   * lacks) draws an empty cell.
   */
  readonly at: readonly [number, number] | undefined
  /** Cell size in the image. */
  readonly size: readonly [number, number]
  /** Drawn size; defaults to the cell size × the skin scale. */
  readonly drawSize?: readonly [number, number]
  readonly style?: StyleProp<ViewStyle>
}

/** One cell of a sprite sheet. */
export const SpriteCell: FC<SpriteCellProps> = props => {
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
      {at && (
        <SkinImage
          image={image}
          width={image.width * kx}
          height={image.height * ky}
          style={{ position: 'absolute', left: -at[0] * kx, top: -at[1] * ky }}
        />
      )}
    </View>
  )
}

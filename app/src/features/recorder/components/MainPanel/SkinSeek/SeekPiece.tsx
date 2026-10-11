// Layout here comes from skin data (rects, sizes), so styles are inline.

import React, { type FC } from 'react'
import { View } from 'react-native'

import type { ResolvedSprite } from '@/bridge/generated'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'

export type SeekPieceProps = {
  readonly sprite: ResolvedSprite | null | undefined
  /** The piece's cell in the sprite, when it has one. */
  readonly at: readonly [number, number] | undefined
  /** In unscaled points. */
  readonly size: readonly [number, number]
  /** A plain box's color, without the sprite cell. */
  readonly color: string | undefined
}

/** The seek bar's track, fill or thumb: its sprite cell, else a colored box. */
export const SeekPiece: FC<SeekPieceProps> = props => {
  const { sprite, at, size, color } = props
  const s = useSkinScale()
  if (sprite && at) {
    return <SpriteCell image={sprite.image} at={at} size={size} />
  }
  if (color) {
    return (
      <View
        style={{
          width: size[0] * s,
          height: size[1] * s,
          backgroundColor: color,
        }}
      />
    )
  }
  return null
}

import React, { type FC } from 'react'

import { SpriteCell } from '@/components/SpriteCell'
import type { ResolvedElement } from '@/native/bridge'

export type MeterCellProps = {
  readonly element: ResolvedElement
  readonly at: readonly [number, number] | undefined
}

/** One of the meter sprite's cells, at the element's size. */
export const MeterCell: FC<MeterCellProps> = props => {
  const { element, at } = props
  if (!element.sprite) {
    return null
  }
  return (
    <SpriteCell
      image={element.sprite.image}
      at={at}
      size={[element.rect[2], element.rect[3]]}
    />
  )
}

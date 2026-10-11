import React, { type FC } from 'react'

import { BarMeter } from './BarMeter'
import { NeedleMeter } from './NeedleMeter'
import type { MeterProps } from './types'

export type LevelMeterProps = MeterProps

/**
 * The level meter. With a sprite, its "on" cell is revealed over the "off"
 * cell up to the level. Otherwise it draws segments from the style: rows
 * (1 = peak; 2 = left and right), segments, gap, vertical, and the on, hot
 * (top 30%), clip (top 10%) and off colors. Style kind "needle" draws
 * analog meters instead (NeedleMeter).
 */
export const LevelMeter: FC<LevelMeterProps> = props => {
  return props.element.style?.kind === 'needle' ? (
    <NeedleMeter {...props} />
  ) : (
    <BarMeter {...props} />
  )
}

import React, { type FC } from 'react'

import type { ResolvedElement } from '@/bridge/generated'
import { useTransport } from '@/features/recorder/components/MainPanel/useTransport'

import { BarMeter } from './BarMeter'
import { NeedleMeter } from './NeedleMeter'

export type LevelMeterProps = {
  readonly element: ResolvedElement
}

/**
 * The level meter, showing the transport's levels. With a sprite, its "on"
 * cell is revealed over the "off" cell up to the level. Otherwise it draws
 * segments from the style: rows (1 = peak; 2 = left and right), segments,
 * gap, vertical, and the on, hot (top 30%), clip (top 10%) and off colors.
 * Style kind "needle" draws analog meters instead (NeedleMeter).
 */
export const LevelMeter: FC<LevelMeterProps> = props => {
  const { element } = props
  const { levels } = useTransport()
  const meter = {
    element,
    peak: levels.peak,
    left: levels.left,
    right: levels.right,
    rmsLeft: levels.rmsLeft,
    rmsRight: levels.rmsRight,
  }
  return element.style?.kind === 'needle' ? (
    <NeedleMeter {...meter} />
  ) : (
    <BarMeter {...meter} />
  )
}

import React, { type FC } from 'react'

import { meterScale } from '@/skin/meterScale'
import type { MeterProps } from '@/windows/MainApp/MainPanel/LevelMeter/types'

import { SegmentedBar } from './SegmentedBar'
import { SpriteBar } from './SpriteBar'

export type BarMeterProps = MeterProps

/** The sprite or segmented bar meter (see LevelMeter). */
export const BarMeter: FC<BarMeterProps> = props =>
  props.element.sprite ? (
    <SpriteBar
      element={props.element}
      sprite={props.element.sprite}
      level={meterScale(props.peak)}
    />
  ) : (
    <SegmentedBar {...props} />
  )

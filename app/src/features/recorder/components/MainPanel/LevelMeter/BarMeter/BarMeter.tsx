import React, { type FC } from 'react'

import type { MeterProps } from '@/features/recorder/components/MainPanel/LevelMeter/types'
import { meterScale } from '@/features/skins/meterScale'

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

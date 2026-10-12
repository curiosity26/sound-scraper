import React, { type FC } from 'react'

import {
  DETECT_PRESET_NAMES,
  DETECT_PRESETS,
} from '@/features/editor/components/EditorPanel/constants'
import { formatStep } from '@/features/editor/components/EditorPanel/formatStep'
import { ToolButton } from '@/features/editor/components/EditorPanel/ToolButton'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import type { FindTracksOptions } from '@/features/editor/types'
import { stepIn } from '@/shared/utils/stepIn'

import { Segmented } from './Segmented'
import { Stepper } from './Stepper'

const THRESHOLDS = [
  -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20,
]
const GAPS = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000]
const MIN_TRACKS = [0, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000]

export type AutoSliceSettingsProps = {
  /** Auto Slice's settings (it's open). */
  readonly options: FindTracksOptions
}

/** The preset, silence level, gap and track lengths, and Remove gaps. */
export const AutoSliceSettings: FC<AutoSliceSettingsProps> = props => {
  const { options: o } = props
  const onChange = useEditor().autoSlice.setOptions
  const preset = DETECT_PRESET_NAMES.find(
    k =>
      DETECT_PRESETS[k].thresholdDb === o.thresholdDb &&
      DETECT_PRESETS[k].minGapMs === o.minGapMs &&
      DETECT_PRESETS[k].minTrackMs === o.minTrackMs,
  )
  // A fragment: the settings wrap with the rest of the bar.
  return (
    <>
      <Segmented
        value={preset ?? null}
        options={[
          { value: 'digital', label: 'Digital' },
          { value: 'vinyl', label: 'Vinyl / Radio' },
        ]}
        onChange={k => {
          onChange({ ...o, ...DETECT_PRESETS[k] })
        }}
      />
      <Stepper
        label="Silence below"
        value={`${String(o.thresholdDb)} dB`}
        onStep={dir => {
          onChange({
            ...o,
            thresholdDb: stepIn(THRESHOLDS, o.thresholdDb, dir),
          })
        }}
      />
      <Stepper
        label="Gaps over"
        value={formatStep(o.minGapMs)}
        onStep={dir => {
          onChange({ ...o, minGapMs: stepIn(GAPS, o.minGapMs, dir) })
        }}
      />
      <Stepper
        label="Tracks over"
        value={o.minTrackMs ? formatStep(o.minTrackMs) : 'any'}
        onStep={dir => {
          onChange({ ...o, minTrackMs: stepIn(MIN_TRACKS, o.minTrackMs, dir) })
        }}
      />
      <ToolButton
        label="Remove gaps"
        glyph={o.removeGaps ? '☑' : '☐'}
        onPress={() => {
          onChange({ ...o, removeGaps: !o.removeGaps })
        }}
      />
    </>
  )
}

/* eslint-disable react-native/no-inline-styles */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { stepIn } from '@/editor/model/stepIn'
import type { DetectOptions } from '@/native/types'

import { DETECT_PRESETS } from './constants'
import { formatStep } from './formatStep'
import { Segmented } from './Segmented'
import { Stepper } from './Stepper'
import { ToolButton } from './ToolButton'
import type { EditorTheme } from './types'

const THRESHOLDS = [
  -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20,
]
const GAPS = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000]
const MIN_TRACKS = [0, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000]

/**
 * Auto Slice's settings, in a bar above the waveform so the proposed
 * slices (dashed) stay in view while the settings change.
 */
export function AutoSliceBar(props: {
  th: EditorTheme
  options: DetectOptions
  onChange: (o: DetectOptions) => void
  found: number
  onApply: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { th, options: o, onChange } = props
  const preset = (
    Object.keys(DETECT_PRESETS) as Array<'digital' | 'vinyl'>
  ).find(
    k =>
      DETECT_PRESETS[k].thresholdDb === o.thresholdDb &&
      DETECT_PRESETS[k].minGapMs === o.minGapMs &&
      DETECT_PRESETS[k].minTrackMs === o.minTrackMs,
  )
  return (
    <View
      style={[
        styles.autoBar,
        { backgroundColor: th.raised, borderColor: th.border },
      ]}
      testID="editor-auto-slice"
    >
      <Text style={[styles.autoTitle, { color: th.text }]}>Auto Slice</Text>
      <Segmented
        th={th}
        value={preset ?? null}
        options={[
          { value: 'digital', label: 'Digital' },
          { value: 'vinyl', label: 'Vinyl / Radio' },
        ]}
        onChange={k => onChange({ ...o, ...DETECT_PRESETS[k] })}
      />
      <Stepper
        th={th}
        label="Silence below"
        value={`${o.thresholdDb} dB`}
        onStep={dir =>
          onChange({
            ...o,
            thresholdDb: stepIn(THRESHOLDS, o.thresholdDb, dir),
          })
        }
      />
      <Stepper
        th={th}
        label="Gaps over"
        value={formatStep(o.minGapMs)}
        onStep={dir =>
          onChange({ ...o, minGapMs: stepIn(GAPS, o.minGapMs, dir) })
        }
      />
      <Stepper
        th={th}
        label="Tracks over"
        value={o.minTrackMs ? formatStep(o.minTrackMs) : 'any'}
        onStep={dir =>
          onChange({ ...o, minTrackMs: stepIn(MIN_TRACKS, o.minTrackMs, dir) })
        }
      />
      <ToolButton
        th={th}
        label="Remove gaps"
        glyph={o.removeGaps ? '☑' : '☐'}
        onPress={() => onChange({ ...o, removeGaps: !o.removeGaps })}
      />
      <View style={styles.flex} />
      <Text style={[styles.autoFound, { color: th.dim }]}>
        {props.found === 0
          ? 'No gaps found'
          : `${props.found + 1} tracks · ${props.found} ${
              props.found === 1 ? 'slice' : 'slices'
            }`}
      </Text>
      <ToolButton th={th} label="Cancel" onPress={props.onCancel} />
      <ToolButton
        th={th}
        label="Add Slices"
        onPress={props.onApply}
        disabled={props.found === 0}
        accent
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  autoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  autoTitle: { fontSize: 12, fontWeight: '600' },
  autoFound: { fontSize: 11 },
})

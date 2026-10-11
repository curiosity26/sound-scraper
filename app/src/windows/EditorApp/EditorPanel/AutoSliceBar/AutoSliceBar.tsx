import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { stepIn } from '@/utils/stepIn'
import {
  DETECT_PRESET_NAMES,
  DETECT_PRESETS,
} from '@/windows/EditorApp/EditorPanel/constants'
import { formatStep } from '@/windows/EditorApp/EditorPanel/formatStep'
import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { Segmented } from './Segmented'
import { Stepper } from './Stepper'

const THRESHOLDS = [
  -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20,
]
const GAPS = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000]
const MIN_TRACKS = [0, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000]

/**
 * Auto Slice's settings, while it's open, in a bar above the waveform so
 * the proposed slices (dashed) stay in view while the settings change.
 */
export const AutoSliceBar: FC = () => {
  const { th, autoSlice } = useEditor()
  const { options: o, setOptions: onChange } = autoSlice
  if (!o) {
    return null
  }
  const found = autoSlice.proposals.length
  const preset = DETECT_PRESET_NAMES.find(
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
        value={`${o.thresholdDb} dB`}
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
      <View style={styles.flex} />
      <Text style={[styles.autoFound, { color: th.dim }]}>
        {found === 0
          ? 'No gaps found'
          : `${found + 1} tracks · ${found} ${
              found === 1 ? 'slice' : 'slices'
            }`}
      </Text>
      <ToolButton label="Cancel" onPress={autoSlice.cancel} />
      <ToolButton
        label="Add Slices"
        onPress={autoSlice.apply}
        disabled={found === 0}
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

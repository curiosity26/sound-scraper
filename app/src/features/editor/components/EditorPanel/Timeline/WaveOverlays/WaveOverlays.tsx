import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { DeletedStretches } from './DeletedStretches'
import { FrameTicks } from './FrameTicks'
import { Playhead } from './Playhead'
import { ProposedSlices } from './ProposedSlices'
import { SelectionBand } from './SelectionBand'
import { SliceLines } from './SliceLines'
import { TrackTints } from './TrackTints'

/**
 * Over the waveform: the tracks' tints, deleted stretches, the selection,
 * frame boundaries, Auto Slice's proposed slices (dashed) and the gaps
 * they're in, the actual slices, and the playhead. Click to move the
 * playhead, drag to select.
 */
export const WaveOverlays: FC = () => {
  const { drag } = useEditor()
  // Layers in drawing order: later ones draw on top.
  return (
    <View
      accessibilityLabel="Waveform"
      style={styles.waveArea}
      {...drag.waveResponder}
    >
      <TrackTints />
      <DeletedStretches />
      <SelectionBand />
      <FrameTicks />
      <ProposedSlices />
      <SliceLines />
      <Playhead />
    </View>
  )
}

const styles = StyleSheet.create({
  waveArea: { flex: 1 },
})

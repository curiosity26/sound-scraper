import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { trackColor } from '@/windows/EditorApp/EditorPanel/trackColor'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'
import { withAlpha } from '@/windows/EditorApp/EditorPanel/withAlpha'

/**
 * Over the waveform: the tracks' tints, deleted stretches, the selection,
 * frame boundaries, Auto Slice's proposed slices (dashed) and the gaps
 * they're in, the actual slices, and the playhead. Click to move the
 * playhead, drag to select.
 */
export const WaveOverlays: FC = () => {
  const { th, view, tracks, selection, drag, autoSlice, headMs } = useEditor()
  const { scale } = view
  /** The stretch being dragged out, or else the selected one. */
  const range = drag.liveSelection
  const c = th.wave
  return (
    <View style={styles.waveArea} {...drag.waveResponder}>
      {tracks.rows.map((tr, i) => (
        <View
          key={`t${i}-${tr.startMs}`}
          pointerEvents="none"
          style={[
            styles.band,
            {
              left: tr.startMs / scale,
              width: (tracks.trackEnd(i) - tr.startMs) / scale,
              backgroundColor: withAlpha(
                trackColor(i),
                selection.selectedTrack === i ? 0x22 : 0x10,
              ),
            },
          ]}
        />
      ))}
      {drag.shown.deleted.map(r => {
        const edge =
          r.id === selection.selectedRegion
            ? c('spliceSelected', '#fff0a0')
            : 'transparent'
        return (
          <View
            key={r.id}
            pointerEvents="none"
            style={[
              styles.band,
              styles.deleted,
              {
                left: r.startMs / scale,
                width: Math.max(1, (r.endMs - r.startMs) / scale),
                backgroundColor: c('deleted', '#00000099'),
                borderColor: edge,
              },
            ]}
          />
        )
      })}
      {range && (
        <View
          pointerEvents="none"
          style={[
            styles.band,
            styles.selection,
            {
              left: range.startMs / scale,
              width: Math.max(1, (range.endMs - range.startMs) / scale),
              backgroundColor: c('selection', '#ffffff30'),
              borderColor: withAlpha(th.text, 0x90),
            },
          ]}
        />
      )}
      {view.frameTicks.map(ms => (
        <View
          key={`f${ms}`}
          pointerEvents="none"
          style={[
            styles.frameTick,
            {
              left: ms / scale,
              backgroundColor: c('rulerText', '#f3ead0'),
            },
          ]}
        />
      ))}
      {autoSlice.proposals.map(p => (
        <React.Fragment key={`p${p.atMs}`}>
          <View
            pointerEvents="none"
            style={[
              styles.band,
              {
                left: p.gapStartMs / scale,
                width: Math.max(1, (p.gapEndMs - p.gapStartMs) / scale),
                backgroundColor: withAlpha(th.accent, 0x26),
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.band,
              styles.proposal,
              { left: p.atMs / scale, borderColor: th.accent },
            ]}
          />
        </React.Fragment>
      ))}
      {drag.shown.splices.map(s => (
        <View
          key={s.id}
          pointerEvents="none"
          style={[
            styles.line,
            {
              left: s.atMs / scale,
              backgroundColor:
                s.id === selection.selectedSlice
                  ? c('spliceSelected', '#fff0a0')
                  : withAlpha(th.text, 0xb0),
            },
          ]}
        />
      ))}
      {headMs !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.line,
            {
              left: headMs / scale,
              backgroundColor: c('playhead', '#ff4a3a'),
            },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  waveArea: { flex: 1 },
  /** A full-height stretch (its left and width are set inline). */
  band: { position: 'absolute', top: 0, bottom: 0 },
  deleted: { borderWidth: 1 },
  selection: { borderLeftWidth: 1, borderRightWidth: 1 },
  proposal: { width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  frameTick: {
    position: 'absolute',
    top: 0,
    height: 6,
    width: StyleSheet.hairlineWidth,
    opacity: 0.35,
  },
})

import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import type { Proposal } from '@/native/types'

import type { Region, Splice } from './model'
import { trackColor } from './trackColor'
import type { EditorTheme, ResponderProps, TimeRange, TrackRow } from './types'
import { withAlpha } from './withAlpha'

export type WaveOverlaysProps = {
  readonly th: EditorTheme
  /** The zoom, in ms per point. */
  readonly scale: number
  readonly rows: readonly TrackRow[]
  readonly trackEnd: (index: number) => number
  readonly selectedTrack: number | null
  readonly deleted: readonly Region[]
  readonly selectedRegion: number | null
  readonly selection: TimeRange | null
  /** MP3 frame boundaries in view. */
  readonly frameTicks: readonly number[]
  /** Auto Slice's proposed slices (dashed) and the gaps they're in. */
  readonly proposals: readonly Proposal[]
  readonly splices: readonly Splice[]
  readonly selectedSlice: number | null
  /** Where the playhead (or the scrub) is, if it's shown. */
  readonly headMs: number | null
  /** Click to move the playhead, drag to select. */
  readonly responder: ResponderProps
}

/**
 * Over the waveform: the tracks' tints, deleted stretches, the selection,
 * frame boundaries, proposed and actual slices, and the playhead.
 */
export const WaveOverlays: FC<WaveOverlaysProps> = props => {
  const { th, scale, selection, headMs } = props
  const c = th.wave
  return (
    <View style={styles.waveArea} {...props.responder}>
      {props.rows.map((tr, i) => (
        <View
          key={`t${i}-${tr.startMs}`}
          pointerEvents="none"
          style={[
            styles.band,
            {
              left: tr.startMs / scale,
              width: (props.trackEnd(i) - tr.startMs) / scale,
              backgroundColor: withAlpha(
                trackColor(i),
                props.selectedTrack === i ? 0x22 : 0x10,
              ),
            },
          ]}
        />
      ))}
      {props.deleted.map(r => {
        const edge =
          r.id === props.selectedRegion
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
      {selection && (
        <View
          pointerEvents="none"
          style={[
            styles.band,
            styles.selection,
            {
              left: selection.startMs / scale,
              width: Math.max(1, (selection.endMs - selection.startMs) / scale),
              backgroundColor: c('selection', '#ffffff30'),
              borderColor: withAlpha(th.text, 0x90),
            },
          ]}
        />
      )}
      {props.frameTicks.map(ms => (
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
      {props.proposals.map(p => (
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
      {props.splices.map(s => (
        <View
          key={s.id}
          pointerEvents="none"
          style={[
            styles.line,
            {
              left: s.atMs / scale,
              backgroundColor:
                s.id === props.selectedSlice
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

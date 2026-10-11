import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { RULER } from './constants'
import { formatTime } from './model'
import type { EditorTheme, ResponderProps, RulerTick } from './types'

export type TimelineRulerProps = {
  readonly th: EditorTheme
  readonly contentWidth: number
  /** The zoom, in ms per point. */
  readonly scale: number
  readonly ticks: readonly RulerTick[]
  /** The step between labels, in ms. */
  readonly majorStepMs: number
  /** Where the playhead (or the scrub) is, if it's shown. */
  readonly headMs: number | null
  /** Click for the playhead, drag to scrub. */
  readonly responder: ResponderProps
}

/** The time ruler: ticks, their labels, and the playhead's cap. */
export const TimelineRuler: FC<TimelineRulerProps> = props => {
  const { th, scale, headMs } = props
  const c = th.wave
  return (
    <View
      testID="editor-ruler"
      style={[
        styles.ruler,
        {
          width: props.contentWidth,
          backgroundColor: c('ruler', '#221d1a'),
        },
      ]}
      {...props.responder}
    >
      {props.ticks.map(tick => (
        <View
          key={tick.ms}
          pointerEvents="none"
          style={[
            styles.tick,
            tick.major ? styles.majorTick : styles.minorTick,
            {
              left: tick.ms / scale,
              backgroundColor: c('rulerText', '#f3ead0'),
            },
          ]}
        />
      ))}
      {props.ticks
        .filter(tick => tick.major)
        .map(tick => (
          <Text
            key={`l${tick.ms}`}
            pointerEvents="none"
            style={[
              styles.tickLabel,
              {
                left: tick.ms / scale + 3,
                color: c('rulerText', '#f3ead0'),
              },
            ]}
          >
            {formatTime(tick.ms, props.majorStepMs)}
          </Text>
        ))}
      {headMs !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.playheadCap,
            {
              left: headMs / scale - 6,
              borderTopColor: c('playhead', '#ff4a3a'),
            },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  ruler: { height: RULER },
  tick: {
    position: 'absolute',
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  majorTick: { height: RULER / 2, opacity: 0.7 },
  minorTick: { height: RULER / 5, opacity: 0.35 },
  tickLabel: {
    position: 'absolute',
    top: 2,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  playheadCap: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
})

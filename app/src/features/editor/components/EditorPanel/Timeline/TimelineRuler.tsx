import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatTime } from '@/features/editor/components/EditorPanel/model'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { RULER } from './constants'

/**
 * The time ruler: ticks, their labels, and the playhead's cap. Click for
 * the playhead, drag to scrub.
 */
export const TimelineRuler: FC = () => {
  const { th, view, headMs, scrub } = useEditor()
  const { scale, ticks } = view
  const c = th.wave
  return (
    <View
      testID="editor-ruler"
      style={[
        styles.ruler,
        {
          width: view.contentWidth,
          backgroundColor: c('ruler', '#221d1a'),
        },
      ]}
      {...scrub.rulerResponder}
    >
      {ticks.map(tick => (
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
      {ticks
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
            {formatTime(tick.ms, view.steps.major)}
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

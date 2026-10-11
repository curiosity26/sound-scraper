import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { RecorderState } from '@/native/types'
import { formatElapsed } from '@/recorder/formatElapsed'
import { meterScale } from '@/skin/meterScale'
import { colors } from '@/theme/colors'

import { RecordButton } from './RecordButton'

export type RecordBarProps = {
  readonly state: RecorderState
  /** Waiting for start to resolve (e.g. the permission prompt). */
  readonly starting: boolean
  readonly elapsedMs: number
  /** Linear peak level, 0..1. */
  readonly peak: number
  readonly onRecord: () => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onStop: () => void
  readonly textStyle: object
}

/** Record / Pause / Resume / Stop with elapsed time and a level meter. */
export const RecordBar: FC<RecordBarProps> = props => {
  const { state, starting, elapsedMs, peak, textStyle } = props
  const active = state === 'recording' || state === 'paused'

  return (
    <View style={styles.bar}>
      {active ? (
        <>
          <RecordButton
            testID="pause-resume"
            label={state === 'paused' ? 'Resume' : 'Pause'}
            onPress={state === 'paused' ? props.onResume : props.onPause}
            color={colors.accent}
          />
          <RecordButton
            testID="stop"
            label="■ Stop"
            onPress={props.onStop}
            color={colors.record}
          />
        </>
      ) : (
        <RecordButton
          testID="record"
          label={
            state === 'finalizing'
              ? 'Saving…'
              : starting
              ? 'Starting…'
              : '● Record'
          }
          onPress={props.onRecord}
          color={colors.record}
          disabled={starting || state === 'finalizing'}
        />
      )}
      <Text testID="elapsed" style={[styles.time, textStyle]}>
        {formatElapsed(elapsedMs)}
      </Text>
      <View style={styles.meter}>
        <View
          style={[
            styles.meterFill,
            { width: `${Math.round(Math.min(1, meterScale(peak)) * 100)}%` },
          ]}
        />
      </View>
      <Text style={[styles.state, textStyle]}>{stateLabel(state)}</Text>
    </View>
  )
}

const stateLabel = (state: RecorderState): string => {
  switch (state) {
    case 'recording':
      return 'Recording'
    case 'paused':
      return 'Paused'
    case 'finalizing':
      return 'Saving'
    default:
      return 'Ready'
  }
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10 },
  time: { fontSize: 18, fontVariant: ['tabular-nums'], minWidth: 64 },
  meter: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  meterFill: { height: 8, backgroundColor: '#34a853' },
  state: { fontSize: 13, opacity: 0.7, minWidth: 64 },
})

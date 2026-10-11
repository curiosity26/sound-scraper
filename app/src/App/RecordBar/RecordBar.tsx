import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useCaptureSources } from '@/App/CaptureSources'
import { useRecorderSession } from '@/App/RecorderSession'
import { useAppearance } from '@/App/useAppearance'
import type { RecorderState } from '@/native/types'
import { formatElapsed } from '@/recorder/formatElapsed'
import { meterScale } from '@/skin/meterScale'
import { colors } from '@/theme/colors'

import { RecordButton } from './RecordButton'

/** Record / Pause / Resume / Stop with elapsed time and a level meter. */
export const RecordBar: FC = () => {
  const { state, starting, elapsedMs, peak, active, ...recorder } =
    useRecorderSession()
  const { selectedApp } = useCaptureSources()
  const { textStyle } = useAppearance()

  return (
    <View style={styles.bar}>
      {active ? (
        <>
          <RecordButton
            testID="pause-resume"
            label={state === 'paused' ? 'Resume' : 'Pause'}
            onPress={state === 'paused' ? recorder.resume : recorder.pause}
            color={colors.accent}
          />
          <RecordButton
            testID="stop"
            label="■ Stop"
            onPress={() => {
              void recorder.stop()
            }}
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
          onPress={() => {
            void recorder.record(selectedApp)
          }}
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

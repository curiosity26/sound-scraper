import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { RecorderState } from './native/SoundScraper'
import { colors } from './theme'

type Props = {
  state: RecorderState
  /** Waiting for start to resolve (e.g. the permission prompt). */
  starting: boolean
  elapsedMs: number
  /** Linear peak level, 0..1. */
  peak: number
  onRecord: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  textStyle: object
}

/** Record / Pause / Resume / Stop with elapsed time and a level meter. */
export function RecordBar(props: Props): React.JSX.Element {
  const { state, starting, elapsedMs, peak, textStyle } = props
  const active = state === 'recording' || state === 'paused'

  return (
    <View style={styles.bar}>
      {active ? (
        <>
          <Button
            testID="pause-resume"
            label={state === 'paused' ? 'Resume' : 'Pause'}
            onPress={state === 'paused' ? props.onResume : props.onPause}
            color={colors.accent}
          />
          <Button
            testID="stop"
            label="■ Stop"
            onPress={props.onStop}
            color={colors.record}
          />
        </>
      ) : (
        <Button
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

function Button(props: {
  testID: string
  label: string
  onPress: () => void
  color: string
  disabled?: boolean
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        { backgroundColor: props.color },
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  )
}

export function formatElapsed(ms: number, tenths = true): string {
  const total = Math.floor(ms / 100)
  const seconds = Math.floor(total / 10) % 60
  const minutes = Math.floor(total / 600)
  if (!tenths) {
    // MM:SS, like a clock (skins with flip-card digits).
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0',
    )}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${total % 10}`
}

/** Maps a linear peak to a 0..1 meter position over a 60 dB range. */
function meterScale(peak: number): number {
  if (peak <= 0) {
    return 0
  }
  const db = 20 * Math.log10(peak)
  return Math.max(0, (db + 60) / 60)
}

function stateLabel(state: RecorderState): string {
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
  button: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
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

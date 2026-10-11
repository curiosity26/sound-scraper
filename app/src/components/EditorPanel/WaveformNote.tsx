import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { WaveformStatus } from '@/native/types'

import type { EditorTheme } from './types'

export type WaveformNoteProps = {
  readonly th: EditorTheme
  readonly status: WaveformStatus
}

/** Over the timeline until the waveform is read: progress, or what failed. */
export const WaveformNote: FC<WaveformNoteProps> = props => {
  const { status } = props
  if (status.state === 'ready') {
    return null
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Text
        style={[styles.note, { color: props.th.wave('rulerText', '#f3ead0') }]}
      >
        {status.state === 'loading'
          ? `Reading the waveform… ${Math.round(status.progress * 100)}%`
          : `Couldn't read the recording: ${status.message}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12 },
})

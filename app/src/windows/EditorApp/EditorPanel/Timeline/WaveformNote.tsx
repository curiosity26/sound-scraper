import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

/** Over the timeline until the waveform is read: progress, or what failed. */
export const WaveformNote: FC = () => {
  const { th, core } = useEditor()
  const { status } = core
  if (status.state === 'ready') {
    return null
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Text style={[styles.note, { color: th.wave('rulerText', '#f3ead0') }]}>
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

import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { MONO } from '@/features/editor/components/EditorPanel/constants'
import { formatTime } from '@/features/editor/components/EditorPanel/model'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

/**
 * The position readout, a small LCD: where the playhead (or the scrub) is,
 * and the length of the stretch selected (or being dragged out), or else
 * of the recording.
 */
export const Lcd: FC = () => {
  const { th, transport, scrub, drag, core } = useEditor()
  const { liveSelection } = drag
  return (
    <View
      style={[styles.lcd, { backgroundColor: th.lcd, borderColor: th.border }]}
    >
      <Text style={[styles.lcdMain, { color: th.lcdText }]}>
        {formatTime(scrub.scrubMs ?? transport.playheadMs, 100)}
      </Text>
      <Text style={[styles.lcdSub, { color: th.lcdText }]}>
        {liveSelection
          ? `SEL ${formatTime(
              liveSelection.endMs - liveSelection.startMs,
              100,
            )}`
          : `OF ${formatTime(core.durationMs, 1000)}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  lcd: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 112,
  },
  lcdMain: { fontSize: 15, fontFamily: MONO, letterSpacing: 0.5 },
  lcdSub: { fontSize: 9, fontFamily: MONO, opacity: 0.65, marginTop: -1 },
})

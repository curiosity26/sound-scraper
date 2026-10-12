import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { IconButton } from './IconButton'

/** To the start, play/pause and stop, in their well. */
export const TransportGroup: FC = () => {
  const { th, core, transport } = useEditor()
  const { ready } = core
  return (
    <View
      style={[
        styles.transport,
        { borderColor: th.border, backgroundColor: th.well },
      ]}
    >
      <IconButton
        icon="toStart"
        label="To the start"
        onPress={() => {
          transport.seek(0)
        }}
        disabled={!ready}
      />
      <IconButton
        icon={transport.playing ? 'pause' : 'play'}
        label={transport.playing ? 'Pause' : 'Play'}
        onPress={() => {
          transport.playPause()
        }}
        disabled={!ready}
        active={transport.playing}
        size={13}
      />
      <IconButton
        icon="stop"
        label="Stop"
        onPress={transport.stop}
        disabled={!transport.loaded}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 2,
    height: 30,
    marginRight: 4,
  },
})

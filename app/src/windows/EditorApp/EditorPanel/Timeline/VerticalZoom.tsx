import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { VSTRIP } from '@/windows/EditorApp/EditorPanel/constants'
import { Slider } from '@/windows/EditorApp/EditorPanel/Slider'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { LANE, RULER } from './constants'

/** The vertical zoom, along the timeline's right edge beside the waveform. */
export const VerticalZoom: FC = () => {
  const { core, view } = useEditor()
  return (
    <View style={styles.vstrip}>
      <Slider
        vertical
        label="Vertical zoom"
        low="zoomOutV"
        high="zoomInV"
        length={Math.max(20, view.viewHeight - RULER - LANE - 34)}
        value={view.vZoom}
        onChange={view.setVZoom}
        disabled={!core.ready}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  vstrip: { width: VSTRIP, alignItems: 'center', paddingTop: RULER + LANE },
})

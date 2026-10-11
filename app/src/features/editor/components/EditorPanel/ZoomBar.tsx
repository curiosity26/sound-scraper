import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { VSTRIP } from './constants'
import { formatTime } from './model'
import { Slider } from './Slider'
import { ToolButton } from './ToolButton'
import { useEditor } from './useEditor'

/** Under the timeline: what's in view, and the horizontal zoom. */
export const ZoomBar: FC = () => {
  const { th, core, view } = useEditor()
  const { ready, durationMs } = core
  /** The ruler's minor step, for how finely to show the range. */
  const stepMs = view.steps.minor
  return (
    <View style={styles.zoomBar}>
      <Text style={[styles.range, { color: th.dim }]}>
        {formatTime(view.firstVisible, stepMs)} –{' '}
        {formatTime(Math.min(durationMs, view.lastVisible), stepMs)}
      </Text>
      <View style={styles.flex} />
      <ToolButton label="Fit" onPress={view.zoomFit} disabled={!ready} />
      <Slider
        label="Horizontal zoom"
        low="zoomOutH"
        high="zoomInH"
        length={140}
        value={view.hZoom}
        onChange={view.setHZoom}
        disabled={!ready}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginRight: VSTRIP,
  },
  range: { fontSize: 10, fontVariant: ['tabular-nums'] },
})

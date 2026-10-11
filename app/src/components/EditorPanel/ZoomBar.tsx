import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { VSTRIP } from './constants'
import { formatTime } from './model'
import { Slider } from './Slider'
import { ToolButton } from './ToolButton'
import type { EditorTheme } from './types'

export type ZoomBarProps = {
  readonly th: EditorTheme
  /** The waveform is read. */
  readonly ready: boolean
  /** What's in view, in ms. */
  readonly fromMs: number
  readonly toMs: number
  /** The ruler's minor step, for how finely to show the range. */
  readonly stepMs: number
  /** The horizontal zoom: 0 = the whole recording, 1 = deepest. */
  readonly zoom: number
  readonly onZoom: (t: number) => void
  readonly onFit: () => void
}

/** Under the timeline: what's in view, and the horizontal zoom. */
export const ZoomBar: FC<ZoomBarProps> = props => {
  const { th } = props
  return (
    <View style={styles.zoomBar}>
      <Text style={[styles.range, { color: th.dim }]}>
        {formatTime(props.fromMs, props.stepMs)} –{' '}
        {formatTime(props.toMs, props.stepMs)}
      </Text>
      <View style={styles.flex} />
      <ToolButton
        th={th}
        label="Fit"
        onPress={props.onFit}
        disabled={!props.ready}
      />
      <Slider
        th={th}
        label="Horizontal zoom"
        low="zoomOutH"
        high="zoomInH"
        length={140}
        value={props.zoom}
        onChange={props.onZoom}
        disabled={!props.ready}
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

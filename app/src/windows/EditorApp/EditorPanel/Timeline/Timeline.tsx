import React, { type FC } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { VSTRIP } from '@/windows/EditorApp/EditorPanel/constants'
import { Slider } from '@/windows/EditorApp/EditorPanel/Slider'
import { SSWaveformView } from '@/windows/EditorApp/EditorPanel/SSWaveformView'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { LANE, RULER } from './constants'
import { NameField } from './NameField'
import { TimelineRuler } from './TimelineRuler'
import { TrackLane } from './TrackLane'
import { WaveformNote } from './WaveformNote'
import { WaveOverlays } from './WaveOverlays'

/**
 * The timeline (ruler, track lane, waveform), with the vertical zoom along
 * its right edge.
 */
export const Timeline: FC = () => {
  const { th, core, view, naming } = useEditor()
  const { contentWidth } = view
  return (
    <View style={styles.timelineRow}>
      <View
        style={[
          styles.timeline,
          {
            backgroundColor: th.wave('background', '#141210'),
            borderColor: th.border,
          },
        ]}
        onLayout={view.onLayout}
      >
        {core.editorId > 0 && (
          <SSWaveformView
            style={[StyleSheet.absoluteFill, styles.waveform]}
            editorId={core.editorId}
            startMs={view.firstVisible}
            msPerPoint={view.scale}
            colors={view.waveColors}
          />
        )}
        <ScrollView
          ref={view.scrollRef}
          horizontal
          scrollEventThrottle={16}
          onScroll={view.onScroll}
          showsHorizontalScrollIndicator
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width: contentWidth }}
        >
          <View style={[styles.content, { width: contentWidth }]}>
            {/* Ruler: click for the playhead, drag to scrub */}
            <TimelineRuler />

            {/* Track lane: the tracks as named regions */}
            <TrackLane />

            {/* Waveform overlays */}
            <WaveOverlays />
          </View>
        </ScrollView>

        {naming.naming !== null && <NameField key={String(naming.naming)} />}

        <WaveformNote />
      </View>
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
    </View>
  )
}

const styles = StyleSheet.create({
  // The timeline keeps its height; the track list gives way first.
  timelineRow: { flex: 1, flexDirection: 'row', minHeight: 150 },
  vstrip: { width: VSTRIP, alignItems: 'center', paddingTop: RULER + LANE },
  timeline: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
  },
  waveform: { top: RULER + LANE },
  content: { flex: 1 },
})

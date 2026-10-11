// The track editor (docs/track-editor-design.md §4): a transport bar, an
// overview with zoom sliders, then the timeline (time ruler, a lane with the
// tracks as named regions, and the waveform), a track list, and Save, which
// asks in the window whether to keep the original.
//
// Positions are kept in milliseconds of the original recording. The
// waveform is drawn natively (SSWaveformView) behind a horizontal scroll
// view whose content is the whole recording at the current zoom; the
// ruler, regions, slices, selection and playhead are views in that
// content. (The model calls slices "splices".)

import React, { type FC, useRef } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { AutoSliceBar } from './AutoSliceBar'
import { LANE, RULER, VSTRIP } from './constants'
import { EditorHint } from './EditorHint'
import { EditorToolbar } from './EditorToolbar'
import { NameField } from './NameField'
import { OverviewBar } from './OverviewBar'
import { SaveModal } from './SaveModal'
import { Slider } from './Slider'
import { SSWaveformView } from './SSWaveformView'
import { TimelineRuler } from './TimelineRuler'
import { TrackLane } from './TrackLane'
import { TrackList } from './TrackList'
import type { EditorTarget } from './types'
import { useAutoSlice } from './useAutoSlice'
import { useEditHistory } from './useEditHistory'
import { useEditorCommands } from './useEditorCommands'
import { useEditorCore } from './useEditorCore'
import { useEditorSelection } from './useEditorSelection'
import { useEditorTheme } from './useEditorTheme'
import { useEditorTracks } from './useEditorTracks'
import { useEditorTransport } from './useEditorTransport'
import { useFollowPlayhead } from './useFollowPlayhead'
import { useRulerScrub } from './useRulerScrub'
import { useSaveFlow } from './useSaveFlow'
import { useSnap } from './useSnap'
import { useTimelineDrag } from './useTimelineDrag'
import { useTimelineView } from './useTimelineView'
import { useTrackNaming } from './useTrackNaming'
import { WaveformNote } from './WaveformNote'
import { WaveOverlays } from './WaveOverlays'
import { ZoomBar } from './ZoomBar'

export type EditorPanelProps = {
  readonly target: EditorTarget
  /** The skin's waveform colors. */
  readonly colors: Record<string, string>
  /** Saved: the new tracks' file names (the editor should close). */
  readonly onSaved: (files: string[], keptOriginal: boolean) => void
}

export const EditorPanel: FC<EditorPanelProps> = props => {
  const { target, colors } = props
  const th = useEditorTheme(colors)
  const core = useEditorCore(target)
  const { editorId, durationMs, ready, hasMaster } = core
  const history = useEditHistory(target)
  const { edits, commit } = history
  const transport = useEditorTransport(target, durationMs, edits)
  const selection = useEditorSelection()
  const naming = useTrackNaming(edits, commit)
  const view = useTimelineView({
    durationMs,
    playheadMs: transport.loaded ? transport.playheadMs : null,
    colors,
    frames: core.frames,
  })
  const { scale, contentWidth } = view
  const snap = useSnap(durationMs, view.steps.minor)
  const saveFlow = useSaveFlow(target, edits, props.onSaved)
  /** Presses in the timeline start drags only once it's read and no dialog is up. */
  const enabled = ready && !saveFlow.isOpen

  // Clicks don't move keyboard focus to a focusable view on macOS, so the
  // editor takes it when its timeline is clicked (for Delete, Space, M…).
  const rootRef = useRef<View>(null)
  const takeKeys = () => rootRef.current?.focus()
  const pressTimeline = () => {
    naming.finishNaming()
    takeKeys()
  }

  const drag = useTimelineDrag({
    edits,
    commit,
    durationMs,
    scale,
    snapMs: snap.snapMs,
    enabled,
    selection,
    seek: transport.seek,
    onPress: pressTimeline,
  })
  const { shown, liveSelection } = drag
  const tracks = useEditorTracks({
    editorId,
    ready,
    hasMaster,
    durationMs,
    shown,
  })
  const { rows, trackEnd } = tracks
  const autoSlice = useAutoSlice({
    editorId,
    ready,
    finishNaming: naming.finishNaming,
    commit,
  })
  useFollowPlayhead({
    playheadMs: transport.playheadMs,
    playing: transport.playing,
    dragging: drag.dragging,
    scale,
    scrollX: view.scrollX,
    viewWidth: view.viewWidth,
    contentWidth,
    scrollToX: view.scrollToX,
  })
  const scrub = useRulerScrub({
    transport,
    scale,
    snapMs: snap.snapMs,
    enabled,
    onPress: () => {
      pressTimeline()
      selection.setSelectedSlice(null)
    },
  })
  const commands = useEditorCommands({
    title: target.title,
    durationMs,
    history,
    naming,
    selection,
    transport,
    view,
    snap,
    autoSlice,
    saveFlow,
    tracks,
    takeKeys,
  })

  const headMs =
    transport.loaded || scrub.scrubMs !== null
      ? scrub.scrubMs ?? transport.playheadMs
      : null
  const namingTrack =
    naming.naming === null
      ? undefined
      : rows.find(r => r.owner === naming.naming)

  return (
    <View ref={rootRef} style={styles.root} focusable {...commands.keyProps}>
      <EditorToolbar
        th={th}
        ready={ready}
        transport={transport}
        headMs={scrub.scrubMs ?? transport.playheadMs}
        durationMs={durationMs}
        liveSelection={liveSelection}
        history={history}
        snap={snap}
        snapStepMs={view.steps.minor}
        autoSliceOn={autoSlice.options !== null}
        onToggleAutoSlice={autoSlice.toggle}
        onSlice={commands.addSliceAtPlayhead}
        deleteTarget={selection.deleteTarget}
        onDelete={commands.deleteSelected}
        onClearAll={commands.clearAll}
        onSave={saveFlow.ask}
        {...naming.closeNamingOnPress}
      />

      {autoSlice.options && (
        <AutoSliceBar
          th={th}
          options={autoSlice.options}
          onChange={autoSlice.setOptions}
          found={autoSlice.proposals.length}
          onApply={autoSlice.apply}
          onCancel={autoSlice.cancel}
        />
      )}

      {/* Overview and zoom */}
      {editorId > 0 && view.viewWidth > 0 && durationMs > 0 && (
        <OverviewBar
          th={th}
          editorId={editorId}
          width={view.viewWidth + VSTRIP}
          durationMs={durationMs}
          colors={view.waveColors}
          viewStartMs={view.firstVisible}
          viewEndMs={Math.min(durationMs, view.lastVisible)}
          edits={shown}
          tracks={tracks.tracks}
          onScrollTo={view.centerOn}
        />
      )}

      {/* The timeline (ruler, track lane, waveform), with the vertical zoom
          along its right edge */}
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
          {editorId > 0 && (
            <SSWaveformView
              style={[StyleSheet.absoluteFill, styles.waveform]}
              editorId={editorId}
              startMs={view.firstVisible}
              msPerPoint={scale}
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
              <TimelineRuler
                th={th}
                contentWidth={contentWidth}
                scale={scale}
                ticks={view.ticks}
                majorStepMs={view.steps.major}
                headMs={headMs}
                responder={scrub.rulerResponder}
              />

              {/* Track lane: the tracks as named regions */}
              <TrackLane
                th={th}
                contentWidth={contentWidth}
                scale={scale}
                rows={rows}
                trackEnd={trackEnd}
                selectedTrack={selection.selectedTrack}
                splices={shown.splices}
                selectedSlice={selection.selectedSlice}
                showReencode={!hasMaster}
                enabled={enabled}
                onPressRegion={commands.pressRegion}
                sliceResponder={drag.sliceResponder}
              />

              {/* Waveform overlays */}
              <WaveOverlays
                th={th}
                scale={scale}
                rows={rows}
                trackEnd={trackEnd}
                selectedTrack={selection.selectedTrack}
                deleted={shown.deleted}
                selectedRegion={selection.selectedRegion}
                selection={liveSelection}
                frameTicks={view.frameTicks}
                proposals={autoSlice.proposals}
                splices={shown.splices}
                selectedSlice={selection.selectedSlice}
                headMs={headMs}
                responder={drag.waveResponder}
              />
            </View>
          </ScrollView>

          {naming.naming !== null && namingTrack && (
            <NameField
              key={String(naming.naming)}
              th={th}
              left={Math.min(
                Math.max(0, namingTrack.startMs / scale - view.scrollX + 2),
                Math.max(0, view.viewWidth - 200),
              )}
              top={RULER + 1}
              value={naming.nameDraft}
              onChange={naming.setNameDraft}
              onDone={naming.finishNaming}
            />
          )}

          <WaveformNote th={th} status={core.status} />
        </View>
        <View style={styles.vstrip}>
          <Slider
            th={th}
            vertical
            label="Vertical zoom"
            low="zoomOutV"
            high="zoomInV"
            length={Math.max(20, view.viewHeight - RULER - LANE - 34)}
            value={view.vZoom}
            onChange={view.setVZoom}
            disabled={!ready}
          />
        </View>
      </View>

      <ZoomBar
        th={th}
        ready={ready}
        fromMs={view.firstVisible}
        toMs={Math.min(durationMs, view.lastVisible)}
        stepMs={view.steps.minor}
        zoom={view.hZoom}
        onZoom={view.setHZoom}
        onFit={view.zoomFit}
      />

      <View style={styles.trackListBox} {...naming.closeNamingOnPress}>
        <TrackList
          th={th}
          rows={rows}
          selected={selection.selectedTrack}
          showReencode={!hasMaster}
          onSelect={commands.openTrack}
          onRename={naming.rename}
        />
      </View>
      <EditorHint th={th} hasMaster={hasMaster} reencoded={tracks.reencoded} />

      {saveFlow.isOpen && (
        <SaveModal
          th={th}
          title={target.title}
          count={tracks.tracks.length}
          reencoded={tracks.reencoded}
          fromMaster={hasMaster}
          saving={saveFlow.state.kind === 'saving'}
          error={
            saveFlow.state.kind === 'failed' ? saveFlow.state.error : undefined
          }
          onCancel={saveFlow.cancel}
          onChoose={keepOriginal => {
            void saveFlow.save(keepOriginal)
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  // The timeline keeps its height; the track list gives way first.
  timelineRow: { flex: 1, flexDirection: 'row', minHeight: 150 },
  vstrip: { width: VSTRIP, alignItems: 'center', paddingTop: RULER + LANE },
  trackListBox: { flexShrink: 1, minHeight: 60 },
  timeline: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
  },
  waveform: { top: RULER + LANE },
  content: { flex: 1 },
})

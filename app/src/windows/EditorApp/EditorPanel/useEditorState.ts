// The editor's state, put together from its parts: the native editor, the
// edits and their history, playback, the timeline's view, selection,
// naming, drags, Auto Slice, Save and the commands. EditorPanel provides it
// to its parts (EditorContext), which read what they need with useEditor.
import { type RefObject, useRef } from 'react'
import type { View } from 'react-native'

import { useSkin } from '@/hooks/useSkin'

import type { EditorTarget, EditorTheme } from './types'
import { type UseAutoSliceResult, useAutoSlice } from './useAutoSlice'
import { type UseEditHistoryResult, useEditHistory } from './useEditHistory'
import {
  type UseEditorCommandsResult,
  useEditorCommands,
} from './useEditorCommands'
import { type UseEditorCoreResult, useEditorCore } from './useEditorCore'
import {
  type UseEditorSelectionResult,
  useEditorSelection,
} from './useEditorSelection'
import { useEditorTheme } from './useEditorTheme'
import { type UseEditorTracksResult, useEditorTracks } from './useEditorTracks'
import {
  type UseEditorTransportResult,
  useEditorTransport,
} from './useEditorTransport'
import { useFollowPlayhead } from './useFollowPlayhead'
import { type UseRulerScrubResult, useRulerScrub } from './useRulerScrub'
import { type UseSaveFlowResult, useSaveFlow } from './useSaveFlow'
import { type UseSnapResult, useSnap } from './useSnap'
import { type UseTimelineDragResult, useTimelineDrag } from './useTimelineDrag'
import { type UseTimelineViewResult, useTimelineView } from './useTimelineView'
import { type UseTrackNamingResult, useTrackNaming } from './useTrackNaming'

export type UseEditorStateResult = {
  readonly target: EditorTarget
  readonly th: EditorTheme
  readonly core: UseEditorCoreResult
  readonly history: UseEditHistoryResult
  readonly transport: UseEditorTransportResult
  readonly selection: UseEditorSelectionResult
  readonly naming: UseTrackNamingResult
  readonly view: UseTimelineViewResult
  readonly snap: UseSnapResult
  readonly saveFlow: UseSaveFlowResult
  readonly drag: UseTimelineDragResult
  readonly tracks: UseEditorTracksResult
  readonly autoSlice: UseAutoSliceResult
  readonly scrub: UseRulerScrubResult
  readonly commands: UseEditorCommandsResult
  /** Presses in the timeline start drags only once it's read and no dialog is up. */
  readonly enabled: boolean
  /** Where the playhead (or the scrub) is, if it's shown. */
  readonly headMs: number | null
  /** The editor's root view, which takes the keys. */
  readonly rootRef: RefObject<View | null>
}

export const useEditorState = (
  target: EditorTarget,
  onSaved: (files: string[], keptOriginal: boolean) => void,
): UseEditorStateResult => {
  // The skin's waveform colors.
  const colors = useSkin().panels.editor.waveform
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
  const saveFlow = useSaveFlow(target, edits, onSaved)
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
  const tracks = useEditorTracks({
    editorId,
    ready,
    hasMaster,
    durationMs,
    shown: drag.shown,
  })
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

  return {
    target,
    th,
    core,
    history,
    transport,
    selection,
    naming,
    view,
    snap,
    saveFlow,
    drag,
    tracks,
    autoSlice,
    scrub,
    commands,
    enabled,
    headMs:
      transport.loaded || scrub.scrubMs !== null
        ? scrub.scrubMs ?? transport.playheadMs
        : null,
    rootRef,
  }
}

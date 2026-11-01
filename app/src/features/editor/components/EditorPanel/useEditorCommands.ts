// The editor's commands, from its tools, its keys and its track list.
import { useRef } from 'react'

import {
  addSplice,
  adjacentSplice,
  deleteRegion,
  emptyEdits,
  moveSplice,
  removeSplice,
  restoreRegion,
} from './model'
import type { UseAutoSliceResult } from './useAutoSlice'
import type { UseEditHistoryResult } from './useEditHistory'
import type { UseEditorSelectionResult } from './useEditorSelection'
import type { UseEditorTracksResult } from './useEditorTracks'
import type { UseEditorTransportResult } from './useEditorTransport'
import type { UseSaveFlowResult } from './useSaveFlow'
import type { UseSnapResult } from './useSnap'
import type { UseTimelineViewResult } from './useTimelineView'
import type { UseTrackNamingResult } from './useTrackNaming'
import type { UseTrackTagsResult } from './useTrackTags'

const DOUBLE_CLICK_MS = 400

type KeyDownEvent = {
  nativeEvent: { key: string; metaKey?: boolean; shiftKey?: boolean }
}

const KEYS = [
  { key: ' ' },
  { key: 'm' },
  { key: 'M' },
  { key: 'Backspace' },
  { key: 'Delete' },
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: 'ArrowLeft', shiftKey: true },
  { key: 'ArrowRight', shiftKey: true },
  { key: 'Tab' },
  { key: 'Tab', shiftKey: true },
  { key: 'p' },
  { key: 'P' },
  { key: '=' },
  { key: '+' },
  { key: '-' },
  { key: 's' },
  { key: 'S' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
  { key: 's', metaKey: true },
  { key: '0', metaKey: true },
]

// macOS-only View props (not in React Native's types): the keys the
// editor handles, without a focus ring.
const macKeys = (onKeyDown: (e: KeyDownEvent) => void): object => {
  return { enableFocusRing: false, keyDownEvents: KEYS, onKeyDown }
}

/** The keys held while a track in the list is clicked. */
export type TrackPressModifiers = {
  /** Shift: extend the selection. */
  readonly extend: boolean
  /** Ctrl (⌘ on macOS): add to or take from the selection. */
  readonly toggle: boolean
}

export type UseEditorCommandsOptions = {
  /** The first track's name after Clear All. */
  readonly title: string
  readonly durationMs: number
  readonly history: UseEditHistoryResult
  readonly naming: UseTrackNamingResult
  readonly selection: UseEditorSelectionResult
  readonly transport: UseEditorTransportResult
  readonly view: UseTimelineViewResult
  readonly snap: UseSnapResult
  readonly autoSlice: UseAutoSliceResult
  readonly saveFlow: UseSaveFlowResult
  readonly tracks: UseEditorTracksResult
  readonly trackTags: UseTrackTagsResult
  /** Gives the editor keyboard focus. */
  readonly takeKeys: () => void
}

export type UseEditorCommandsResult = {
  /** ✂ / M: a slice at the playhead, with its name field open. */
  readonly addSliceAtPlayhead: () => void
  /** Deletes the selected stretch, removes the slice, or restores a deleted stretch. */
  readonly deleteSelected: () => void
  readonly clearAll: () => void
  /** A track picked in the list: selected, played from, and zoomed to. */
  readonly openTrack: (index: number) => void
  /** A track's region: click to select the track, double-click to rename it. */
  readonly pressRegion: (index: number) => void
  /**
   * A track in the list: click to pick it (as openTrack), shift-click to
   * select the tracks up to it, Ctrl/⌘-click to add or remove it,
   * double-click to edit its tags.
   */
  readonly pressTrack: (index: number, modifiers: TrackPressModifiers) => void
  /** Opens the tag form on the track, or on the selection it's part of. */
  readonly editTrackTags: (index: number) => void
  /** The macOS key props for the editor's root view. */
  readonly keyProps: object
}

export const useEditorCommands = (
  options: UseEditorCommandsOptions,
): UseEditorCommandsResult => {
  const {
    durationMs,
    history,
    naming,
    selection,
    transport,
    view,
    snap,
    autoSlice,
    saveFlow,
  } = options
  const { edits, commit } = history
  const { rows } = options.tracks
  const { playheadMs, seek } = transport
  const { selectedSlice } = selection

  const addSliceAtPlayhead = () => {
    const at = snap.snapMs(playheadMs)
    // A slice at either end would make an empty track.
    if (at <= 0 || at >= durationMs) {
      return
    }
    const { edits: next, id } = addSplice(naming.finishNaming(), at)
    commit(next)
    selection.clearSelections()
    selection.setSelectedSlice(id)
    naming.startNaming(id, next.splices.find(x => x.id === id)?.name ?? '')
  }
  const deleteSelected = () => {
    const { range, selectedRegion } = selection
    if (range && range.endMs - range.startMs > 0) {
      commit(deleteRegion(edits, range.startMs, range.endMs))
      selection.setRange(null)
    } else if (selectedSlice !== null) {
      commit(removeSplice(edits, selectedSlice))
      selection.setSelectedSlice(null)
    } else if (selectedRegion !== null) {
      commit(restoreRegion(edits, selectedRegion))
      selection.setSelectedRegion(null)
    }
  }
  const nudge = (dir: 1 | -1, big: boolean) => {
    const step = big ? 1000 : snap.snapOn ? view.steps.minor : 26
    const s = edits.splices.find(x => x.id === selectedSlice)
    if (s) {
      commit(
        moveSplice(
          edits,
          s.id,
          Math.min(durationMs, Math.max(0, s.atMs + dir * step)),
        ),
      )
    } else {
      seek(playheadMs + dir * step)
    }
  }
  const jump = (dir: 1 | -1) => {
    const s = adjacentSplice(edits, playheadMs, dir)
    seek(s ? s.atMs : dir > 0 ? durationMs : 0)
    selection.setSelectedSlice(s ? s.id : null)
  }
  /** P: plays a couple of seconds either side of the selected slice. */
  const previewSlice = () => {
    const s = edits.splices.find(x => x.id === selectedSlice)
    if (s) {
      transport.previewAround(s.atMs)
    }
  }
  const selectTrack = (i: number) => {
    naming.finishNaming()
    options.takeKeys()
    selection.clearSelections()
    selection.setSelectedTrack(i)
    const tr = rows[i]
    if (tr) {
      seek(tr.startMs)
    }
  }
  // A track's region: click to select the track, double-click to rename it.
  const lastRegionPress = useRef({ i: -1, at: 0 })
  // A track in the list: double-click to edit its tags.
  const lastTrackPress = useRef({ i: -1, at: 0 })
  const openTrack = (i: number) => {
    selectTrack(i)
    const tr = rows[i]
    if (tr) {
      view.zoomToRange(tr.startMs, options.tracks.trackEnd(i))
    }
  }
  const editTrackTags = (i: number) => {
    const { selectedTracks } = selection
    options.trackTags.open(
      selectedTracks.length > 1 && selectedTracks.includes(i)
        ? selectedTracks
        : [i],
    )
  }

  const onKeyDown = (e: KeyDownEvent) => {
    if (saveFlow.isOpen || naming.naming !== null) {
      return
    }
    const { key, metaKey, shiftKey } = e.nativeEvent
    if (!/^[pP]$/.test(key)) {
      transport.cancelPauseTimer()
    }
    if (metaKey) {
      if (key === 'z') {
        if (shiftKey) {
          history.redo()
        } else {
          history.undo()
        }
      } else if (key === 's') {
        if (history.hasEdits) {
          saveFlow.ask()
        }
      } else if (key === '0') {
        view.zoomFit()
      }
      return
    }
    switch (key) {
      case ' ':
        transport.playPause()
        break
      case 'm':
      case 'M':
        addSliceAtPlayhead()
        break
      case 'Backspace':
      case 'Delete':
        deleteSelected()
        break
      case 'ArrowLeft':
        nudge(-1, !!shiftKey)
        break
      case 'ArrowRight':
        nudge(1, !!shiftKey)
        break
      case 'Tab':
        jump(shiftKey ? -1 : 1)
        break
      case 'p':
      case 'P':
        previewSlice()
        break
      case '=':
      case '+':
        view.zoomTo(view.scale / 2)
        break
      case '-':
        view.zoomTo(view.scale * 2)
        break
      case 's':
      case 'S':
        snap.toggleSnap()
        break
      case 'Escape':
        autoSlice.cancel()
        selection.clearSelections()
        break
    }
  }

  return {
    addSliceAtPlayhead,
    deleteSelected,
    clearAll: () => {
      naming.finishNaming(false)
      commit(emptyEdits(options.title))
      selection.clearSelections()
    },
    openTrack,
    pressTrack: (i, modifiers) => {
      if (modifiers.extend || modifiers.toggle) {
        naming.finishNaming()
        lastTrackPress.current = { i: -1, at: 0 }
        if (modifiers.extend) {
          selection.extendTracks(i)
        } else {
          selection.toggleTrack(i)
        }
        return
      }
      const now = Date.now()
      if (
        lastTrackPress.current.i === i &&
        now - lastTrackPress.current.at < DOUBLE_CLICK_MS
      ) {
        lastTrackPress.current = { i: -1, at: 0 }
        editTrackTags(i)
        return
      }
      lastTrackPress.current = { i, at: now }
      openTrack(i)
    },
    editTrackTags,
    pressRegion: i => {
      const now = Date.now()
      const row = rows[i]
      if (
        lastRegionPress.current.i === i &&
        now - lastRegionPress.current.at < DOUBLE_CLICK_MS &&
        row?.owner !== null &&
        row?.owner !== undefined
      ) {
        lastRegionPress.current = { i: -1, at: 0 }
        naming.startNaming(row.owner, row.name)
        return
      }
      lastRegionPress.current = { i, at: now }
      selectTrack(i)
    },
    keyProps: macKeys(onKeyDown),
  }
}

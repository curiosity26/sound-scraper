// Dragging in the timeline: a slice's edge (click to select it, drag to
// move it), or the waveform (click to move the playhead, drag to select a
// stretch).
import { useMemo, useState } from 'react'
import type { GestureResponderEvent } from 'react-native'

import { deletedAt, type Edits, moveSplice } from './model'
import type { ResponderProps, TimeRange } from './types'
import type { UseEditorSelectionResult } from './useEditorSelection'

/** A press that moves less than this (points) is a click. */
const CLICK_SLOP = 3

type Drag =
  | { kind: 'slice'; id: number; atMs: number; fromMs: number; x0: number }
  | { kind: 'select'; anchorMs: number; ms: number; x0: number }

export type UseTimelineDragOptions = {
  readonly edits: Edits
  readonly commit: (next: Edits) => void
  readonly durationMs: number
  /** The zoom, in ms per point. */
  readonly scale: number
  readonly snapMs: (ms: number) => number
  /** Presses start drags (the waveform is read and no dialog is up). */
  readonly enabled: boolean
  readonly selection: UseEditorSelectionResult
  readonly seek: (ms: number) => Promise<void>
  /** Called first on every press (closes the name field, takes the keys). */
  readonly onPress: () => void
}

export type UseTimelineDragResult = {
  readonly dragging: boolean
  /** What's shown: the edits with a slice being dragged where it is now. */
  readonly shown: Edits
  /** The stretch being dragged out, or else the selected one. */
  readonly liveSelection: TimeRange | null
  /** A slice's edge in the lane. */
  readonly sliceResponder: (id: number, atMs: number) => ResponderProps
  /** The waveform. */
  readonly waveResponder: ResponderProps
}

export const useTimelineDrag = (
  options: UseTimelineDragOptions,
): UseTimelineDragResult => {
  const { edits, commit, durationMs, scale, snapMs, selection } = options
  const [drag, setDrag] = useState<Drag | null>(null)
  // What's shown: the edits with a slice being dragged where it is now.
  const shown = useMemo(
    () =>
      drag?.kind === 'slice' ? moveSplice(edits, drag.id, drag.atMs) : edits,
    [edits, drag],
  )

  // A slice's edge in the lane: click to select it, drag to move it.
  const sliceGrant =
    (id: number, atMs: number) => (e: GestureResponderEvent) => {
      options.onPress()
      selection.clearSelections()
      selection.setSelectedSlice(id)
      setDrag({
        kind: 'slice',
        id,
        atMs,
        fromMs: atMs,
        x0: e.nativeEvent.pageX,
      })
    }
  const waveGrant = (e: GestureResponderEvent) => {
    options.onPress()
    const ms = Math.max(
      0,
      Math.min(durationMs, e.nativeEvent.locationX * scale),
    )
    setDrag({ kind: 'select', anchorMs: ms, ms, x0: e.nativeEvent.pageX })
  }
  const move = (e: GestureResponderEvent) => {
    if (!drag) {
      return
    }
    const dx = e.nativeEvent.pageX - drag.x0
    if (drag.kind === 'slice') {
      setDrag({ ...drag, atMs: snapMs(drag.fromMs + dx * scale) })
    } else {
      setDrag({
        ...drag,
        ms: Math.max(0, Math.min(durationMs, drag.anchorMs + dx * scale)),
      })
    }
  }
  const release = (e: GestureResponderEvent) => {
    if (!drag) {
      return
    }
    const dx = e.nativeEvent.pageX - drag.x0
    if (drag.kind === 'slice') {
      if (drag.atMs !== drag.fromMs) {
        commit(moveSplice(edits, drag.id, drag.atMs))
      }
    } else if (Math.abs(dx) < CLICK_SLOP) {
      // A click: move the playhead; a click in a deleted stretch selects it.
      selection.clearSelections()
      selection.setSelectedRegion(deletedAt(edits, drag.anchorMs)?.id ?? null)
      void options.seek(snapMs(drag.anchorMs))
    } else {
      const a = snapMs(Math.min(drag.anchorMs, drag.ms))
      const b = snapMs(Math.max(drag.anchorMs, drag.ms))
      selection.clearSelections()
      selection.setRange(b > a ? { startMs: a, endMs: b } : null)
    }
    setDrag(null)
  }
  const responder = (
    grant: (e: GestureResponderEvent) => void,
  ): ResponderProps => ({
    onStartShouldSetResponder: () => options.enabled,
    onResponderGrant: grant,
    onResponderMove: move,
    onResponderRelease: release,
    onResponderTerminate: release,
    onResponderTerminationRequest: () => false,
  })

  return {
    dragging: drag !== null,
    shown,
    liveSelection:
      drag?.kind === 'select' &&
      Math.abs(drag.ms - drag.anchorMs) / scale >= CLICK_SLOP
        ? {
            startMs: Math.min(drag.anchorMs, drag.ms),
            endMs: Math.max(drag.anchorMs, drag.ms),
          }
        : selection.range,
    sliceResponder: (id, atMs) => responder(sliceGrant(id, atMs)),
    waveResponder: responder(waveGrant),
  }
}

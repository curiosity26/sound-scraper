// What's selected in the editor: a stretch of the waveform, a slice, a
// deleted stretch, or tracks. They're separate because some commands
// (Tab to the next slice) set one without clearing the others.
import { useState } from 'react'

import type { DeleteTarget, TimeRange } from './types'

export type UseEditorSelectionResult = {
  /** A stretch of the waveform. */
  readonly range: TimeRange | null
  readonly selectedSlice: number | null
  /** A deleted stretch (Delete restores it). */
  readonly selectedRegion: number | null
  /** The track picked last (the one a shift-click extends from). */
  readonly selectedTrack: number | null
  /** Every selected track (shift- or Ctrl/⌘-click adds to it), in order. */
  readonly selectedTracks: readonly number[]
  /** What Delete would act on. */
  readonly deleteTarget: DeleteTarget
  readonly setRange: (range: TimeRange | null) => void
  readonly setSelectedSlice: (id: number | null) => void
  readonly setSelectedRegion: (id: number | null) => void
  /** Selects just this track (or none). */
  readonly setSelectedTrack: (index: number | null) => void
  /** Ctrl/⌘-click: adds the track to the selection, or takes it out. */
  readonly toggleTrack: (index: number) => void
  /** Shift-click: selects the tracks from the last one picked to this one. */
  readonly extendTracks: (index: number) => void
  readonly clearSelections: () => void
}

type Tracks = { picked: number | null; all: readonly number[] }

const NO_TRACKS: Tracks = { picked: null, all: [] }

export const useEditorSelection = (): UseEditorSelectionResult => {
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [tracks, setTracks] = useState<Tracks>(NO_TRACKS)
  const [range, setRange] = useState<TimeRange | null>(null)
  return {
    range,
    selectedSlice,
    selectedRegion,
    selectedTrack: tracks.picked,
    selectedTracks: tracks.all,
    deleteTarget: range
      ? 'selection'
      : selectedSlice !== null
      ? 'slice'
      : selectedRegion !== null
      ? 'region'
      : null,
    setRange,
    setSelectedSlice,
    setSelectedRegion,
    setSelectedTrack: index => {
      setTracks(index === null ? NO_TRACKS : { picked: index, all: [index] })
    },
    toggleTrack: index => {
      setTracks(t =>
        t.all.includes(index)
          ? {
              picked: t.picked === index ? null : t.picked,
              all: t.all.filter(i => i !== index),
            }
          : { picked: index, all: [...t.all, index].toSorted((a, b) => a - b) },
      )
    },
    extendTracks: index => {
      setTracks(t => {
        const from = t.picked ?? index
        const [lo, hi] = from < index ? [from, index] : [index, from]
        return {
          picked: from,
          all: Array.from({ length: hi - lo + 1 }, (_, k) => lo + k),
        }
      })
    },
    clearSelections: () => {
      setRange(null)
      setSelectedSlice(null)
      setSelectedRegion(null)
      setTracks(NO_TRACKS)
    },
  }
}

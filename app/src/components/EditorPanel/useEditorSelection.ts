// What's selected in the editor: a stretch of the waveform, a slice, a
// deleted stretch, or a track. They're separate because some commands
// (Tab to the next slice) set one without clearing the others.
import { useState } from 'react'

import type { DeleteTarget, TimeRange } from './types'

export type UseEditorSelectionResult = {
  /** A stretch of the waveform. */
  readonly range: TimeRange | null
  readonly selectedSlice: number | null
  /** A deleted stretch (Delete restores it). */
  readonly selectedRegion: number | null
  readonly selectedTrack: number | null
  /** What Delete would act on. */
  readonly deleteTarget: DeleteTarget
  readonly setRange: (range: TimeRange | null) => void
  readonly setSelectedSlice: (id: number | null) => void
  readonly setSelectedRegion: (id: number | null) => void
  readonly setSelectedTrack: (index: number | null) => void
  readonly clearSelections: () => void
}

export const useEditorSelection = (): UseEditorSelectionResult => {
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null)
  const [range, setRange] = useState<TimeRange | null>(null)
  return {
    range,
    selectedSlice,
    selectedRegion,
    selectedTrack,
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
    setSelectedTrack,
    clearSelections: () => {
      setRange(null)
      setSelectedSlice(null)
      setSelectedRegion(null)
      setSelectedTrack(null)
    },
  }
}

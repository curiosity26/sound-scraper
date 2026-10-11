import { useContext } from 'react'

import { RecordingPickerContext } from './RecordingPickerContext'
import type { UseRecordingPickerStateResult } from './useRecordingPickerState'

/** The sheet's search and choices (inside an AddRecordingsSheet). */
export const useRecordingPicker = (): UseRecordingPickerStateResult => {
  const picker = useContext(RecordingPickerContext)
  if (!picker) {
    throw new Error('useRecordingPicker outside an AddRecordingsSheet')
  }
  return picker
}

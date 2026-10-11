import { createContext } from 'react'

import type { UseRecordingPickerStateResult } from './useRecordingPickerState'

/**
 * The sheet's search and the recordings chosen: set by AddRecordingsSheet,
 * read by its list and footer.
 */
export const RecordingPickerContext =
  createContext<UseRecordingPickerStateResult | null>(null)

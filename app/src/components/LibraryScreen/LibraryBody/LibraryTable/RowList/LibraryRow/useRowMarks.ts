// How a row is marked: selected (shown in the details, or the playlist's
// selected item), loaded for playback (▶), or past what fits on the CD.
import { useSyncExternalStore } from 'react'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useSelection } from '@/hooks/useSelection'
import type { Row } from '@/library/types'
import { playback } from '@/playback/playback'

export type UseRowMarksResult = {
  readonly isSelected: boolean
  readonly isLoaded: boolean
  /** Past the CD's capacity (playlist rows only). */
  readonly isOver: boolean
}

/** The recording loaded for playback; re-renders only when it changes,
 * not on every position update. */
const loadedFileName = () => playback.get().fileName

export const useRowMarks = (row: Row): UseRowMarksResult => {
  // Shows a playlist instead of the library.
  const playlist = useLibraryView().shown.view
  const selectedNames = useSelection().fileNames
  // The row shown in the details panel, and the one loaded for playback.
  const selected = selectedNames.length === 1 ? selectedNames[0] : undefined
  const loaded = useSyncExternalStore(playback.subscribe, loadedFileName)
  return {
    isSelected: playlist
      ? row.itemId === playlist.selectedItemId
      : row.fileName === selected,
    isLoaded: playlist
      ? row.itemId === playlist.playingItemId ||
        (playlist.playingItemId === null && row.fileName === loaded)
      : row.fileName === loaded,
    isOver:
      playlist !== undefined &&
      playlist.firstOver >= 0 &&
      row.index !== undefined &&
      row.index >= playlist.firstOver,
  }
}

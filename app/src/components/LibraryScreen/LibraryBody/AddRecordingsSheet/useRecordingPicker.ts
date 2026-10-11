// "+ Add Recordings…": the library searched, and the recordings chosen (in
// the order they were checked) with their total length.
import { useMemo, useState } from 'react'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { filterRecordings } from '@/library/filterRecordings'
import type { Recording } from '@/native/types'

export type UseRecordingPickerResult = {
  readonly query: string
  readonly setQuery: (query: string) => void
  /** The recordings matching the search. */
  readonly rows: readonly Recording[]
  /** File names chosen, in the order they were checked. */
  readonly picked: string[]
  readonly toggle: (fileName: string) => void
  /** The chosen recordings' total length. */
  readonly pickedMs: number
  /** File names already in the playlist (marked, still addable). */
  readonly already: ReadonlySet<string>
}

export const useRecordingPicker = (): UseRecordingPickerResult => {
  const { recordings, playlistsState } = useLibraryView()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const rows = useMemo(
    () => filterRecordings(recordings, query),
    [recordings, query],
  )
  return {
    query,
    setQuery,
    rows,
    picked,
    toggle: name => {
      setPicked(p =>
        p.includes(name) ? p.filter(n => n !== name) : [...p, name],
      )
    },
    pickedMs: recordings
      .filter(r => picked.includes(r.fileName))
      .reduce((sum, r) => sum + r.durationMs, 0),
    already: new Set(playlistsState.items.map(i => i.fileName)),
  }
}

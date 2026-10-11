// The table's rows: the library's recordings or a playlist's rows, searched
// and sorted (each view keeps its own sort).
import { useMemo, useState } from 'react'

import { DEFAULT_SORT } from '@/library/constants'
import { displayName } from '@/library/displayName'
import { filterRecordings } from '@/library/filterRecordings'
import type { PlaylistView, Row, Sort, SortKey } from '@/library/types'
import type { Recording } from '@/native/types'

import { filterPlaylistRows } from './filterPlaylistRows'
import { nextSort } from './nextSort'
import { rowName } from './rowName'
import { sortPlaylistRows } from './sortPlaylistRows'
import { sortRecordings } from './sortRecordings'

const SORT_POSITION: Sort = { key: 'position', ascending: true }

export type UseLibraryRowsProps = {
  readonly recordings: readonly Recording[]
  /** Shows a playlist instead of the library. */
  readonly playlist: PlaylistView | undefined
}

export type UseLibraryRowsResult = {
  /** The search text. */
  readonly query: string
  readonly setQuery: (query: string) => void
  readonly sort: Sort
  /** A column header was pressed. */
  readonly toggleSort: (key: SortKey) => void
  /** The rows shown, searched and sorted. */
  readonly rows: Row[]
  /** Rows before the search. */
  readonly total: number
  /** Reordering: only in the playlist's own order, unfiltered. */
  readonly canReorder: boolean
  /** The playlist's item ids in its own order (none in the library). */
  readonly order: readonly number[]
}

export const useLibraryRows = (
  props: UseLibraryRowsProps,
): UseLibraryRowsResult => {
  const { recordings, playlist } = props
  const [query, setQuery] = useState('')
  const [librarySort, setLibrarySort] = useState<Sort>(DEFAULT_SORT)
  const [playlistSort, setPlaylistSort] = useState<Sort>(SORT_POSITION)
  const sort = playlist ? playlistSort : librarySort
  const setSort = playlist ? setPlaylistSort : setLibrarySort

  const rows: Row[] = useMemo(() => {
    if (playlist) {
      const sorted = sortPlaylistRows(
        filterPlaylistRows(playlist.rows, query),
        sort,
      )
      return sorted.map(r => ({
        fileName: r.item.fileName,
        recording: r.recording,
        itemId: r.item.id,
        position: r.position,
        name: rowName(r),
        index: r.position - 1,
      }))
    }
    return sortRecordings(filterRecordings(recordings, query), sort).map(r => ({
      fileName: r.fileName,
      recording: r,
      name: displayName(r),
    }))
  }, [recordings, playlist, query, sort])

  return {
    query,
    setQuery,
    sort,
    toggleSort: key => {
      setSort(s => nextSort(s, key))
    },
    rows,
    total: playlist ? playlist.rows.length : recordings.length,
    canReorder:
      playlist !== undefined &&
      sort.key === 'position' &&
      sort.ascending &&
      query.trim() === '',
    order: playlist?.rows.map(r => r.item.id) ?? [],
  }
}

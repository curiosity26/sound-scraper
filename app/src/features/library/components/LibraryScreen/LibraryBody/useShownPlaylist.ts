// The playlist showing in the library (in place of every recording): its
// rows, the CD capacity, the row shown in the details panel, and what the
// table, the burn button and "+ Add Recordings…" do with it.
import { useEffect, useMemo, useState } from 'react'

import type { Recording } from '@/bridge/types'
import type { BurnTarget } from '@/features/library/components/LibraryScreen/types'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import type { PlaylistView } from '@/features/library/types'
import { discCapacity } from '@/features/playlists/discCapacity'
import type { UsePlaylistsResult } from '@/features/playlists/hooks/usePlaylists'
import { playlists } from '@/features/playlists/playlists'
import type { Capacity, PlaylistRow } from '@/features/playlists/types'
import { errorText } from '@/shared/utils/errorText'

import { playlistRows } from './playlistRows'
import { showDetails } from './showDetails'

export type UseShownPlaylistProps = {
  readonly recordings: readonly Recording[]
  readonly state: UsePlaylistsResult
}

export type UseShownPlaylistResult = {
  /** A playlist is showing (not the whole library). */
  readonly showing: boolean
  readonly activeName: string | undefined
  /** The showing playlist's rows; none in the library. */
  readonly rows: readonly PlaylistRow[]
  readonly capacity: Capacity
  /** For the table; undefined in the library. */
  readonly view: PlaylistView | undefined
  /** Marks a row as the one in the details panel (autoplay moves it). */
  readonly selectItem: (itemId: number | null) => void
  /** What to burn: the showing playlist's present tracks. */
  readonly burnTarget: () => BurnTarget | undefined
  /** Adds recordings from "+ Add Recordings…". */
  readonly addRecordings: (fileNames: readonly string[]) => void
}

export const useShownPlaylist = (
  props: UseShownPlaylistProps,
): UseShownPlaylistResult => {
  const { recordings, state } = props
  const { showLibraryMenu, openDetails, onMessage } = useLibraryScreen()
  // Playlists show only with the library panel's menus.
  const enabled = showLibraryMenu !== undefined
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const showing = enabled && state.activeId !== null
  const activeName = state.playlists.find(p => p.id === state.activeId)?.name
  const rows = useMemo(
    () => (showing ? playlistRows(state.items, recordings) : []),
    [showing, state.items, recordings],
  )
  const capacity = useMemo(() => discCapacity(rows), [rows])

  // Switching between the library and a playlist clears the selected row.
  useEffect(() => {
    setSelectedItemId(null)
  }, [state.activeId])

  const view: PlaylistView | undefined = showing
    ? {
        rows,
        playingItemId: state.playingItemId,
        selectedItemId,
        firstOver: capacity.firstOver,
        onSelectItem: (row: PlaylistRow) => {
          setSelectedItemId(row.item.id)
          playlists.setPlaying(row.item.id)
          showDetails([row.item.fileName], openDetails)
        },
        onReorder: ids => {
          try {
            playlists.setOrder(ids)
          } catch (e) {
            onMessage({ text: errorText(e), isError: true })
          }
        },
        onRemove: ids => {
          try {
            playlists.remove(ids)
          } catch (e) {
            onMessage({ text: errorText(e), isError: true })
          }
        },
      }
    : undefined

  return {
    showing,
    activeName,
    rows,
    capacity,
    view,
    selectItem: setSelectedItemId,
    burnTarget: () => {
      const playlistId = state.activeId
      if (playlistId === null) {
        return undefined
      }
      return {
        playlistId,
        name: activeName ?? 'Playlist',
        tracks: rows.flatMap(r =>
          r.recording
            ? [
                {
                  path: r.recording.path,
                  title: r.recording.title,
                  performer: r.recording.artist,
                  durationMs: r.recording.durationMs,
                },
              ]
            : [],
        ),
      }
    },
    addRecordings: fileNames => {
      const playlistId = state.activeId
      if (playlistId === null) {
        return
      }
      try {
        playlists.add(playlistId, fileNames)
      } catch (e) {
        onMessage({
          text: `Couldn't add to the playlist: ${errorText(e)}`,
          isError: true,
        })
      }
    },
  }
}

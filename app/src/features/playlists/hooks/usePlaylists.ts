import { useEffect, useState } from 'react'

import { playlists, type PlaylistsState } from '@/features/playlists/playlists'

/** The playlists' state (see PlaylistsState). */
export type UsePlaylistsResult = PlaylistsState

/**
 * The playlists, re-rendering on changes. Plain state rather than
 * useSyncExternalStore: the library re-reads the playlists inside a
 * transition (useRecordingList) and needs this update to wait for it.
 */
export const usePlaylists = (): UsePlaylistsResult => {
  const [s, setS] = useState(playlists.get)
  useEffect(() => {
    setS(playlists.get())
    return playlists.subscribe(setS)
  }, [])
  return s
}

import { useEffect, useState } from 'react'

import { playlists, type PlaylistsState } from '@/playlists/playlists'

/** The playlists, re-rendering on changes. */
export const usePlaylists = (): PlaylistsState => {
  const [s, setS] = useState(playlists.get)
  useEffect(() => {
    setS(playlists.get())
    return playlists.subscribe(setS)
  }, [])
  return s
}

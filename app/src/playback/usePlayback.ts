import { useEffect, useState } from 'react'

import { type Playback, playback } from './playback'

/** The current playback, re-rendering on changes. */
export function usePlayback(): Playback {
  const [p, setP] = useState(playback.get())
  useEffect(() => {
    setP(playback.get())
    return playback.subscribe(setP)
  }, [])
  return p
}

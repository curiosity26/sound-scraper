import { useEffect, useState } from 'react'

import { type Playback, playback } from '@/playback/playback'

/** The current playback, re-rendering on changes. */
export const usePlayback = (): Playback => {
  const [p, setP] = useState(playback.get())
  useEffect(() => {
    setP(playback.get())
    return playback.subscribe(setP)
  }, [])
  return p
}

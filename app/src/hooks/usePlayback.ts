import { useSyncExternalStore } from 'react'

import { type Playback, playback } from '@/playback/playback'

/** The current playback, re-rendering on changes. */
export const usePlayback = (): Playback =>
  useSyncExternalStore(playback.subscribe, playback.get)

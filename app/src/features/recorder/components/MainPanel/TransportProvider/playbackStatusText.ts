import type { PlayerState } from '@/bridge/types'

/** Status while a loaded recording plays back (the recorder is idle). */
export const playbackStatusText = (state: PlayerState): string => {
  switch (state) {
    case 'playing':
      return '▶ PLAYING'
    case 'paused':
      return '⏸ PAUSED'
    default:
      return '■ STOPPED'
  }
}

import type { PlayerState } from '@/bridge/types'
import { assertNever } from '@/shared/utils/assertNever'

/** Status while a loaded recording plays back (the recorder is idle). */
export const playbackStatusText = (state: PlayerState): string => {
  switch (state) {
    case 'playing':
      return '▶ PLAYING'
    case 'paused':
      return '⏸ PAUSED'
    case 'empty':
    case 'stopped':
      return '■ STOPPED'
    default:
      return assertNever(state)
  }
}

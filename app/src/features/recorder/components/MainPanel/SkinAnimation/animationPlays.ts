import type { ResolvedAnimation } from '@/bridge/generated'
import type { RecorderState } from '@/bridge/types'
import { assertNever } from '@/shared/utils/assertNever'

/**
 * Whether an animation plays in this state: the recorder's, or during
 * playback "recording"/"paused" for playing/paused (`playing` is true
 * while playing back).
 */
export const animationPlays = (
  play: ResolvedAnimation['play'],
  state: RecorderState,
  playing = false,
): boolean => {
  switch (play) {
    case 'always':
      return true
    case 'playing':
      return playing
    case 'rolling':
      return state === 'recording'
    case 'recording':
      return state === 'recording' && !playing
    case 'active':
      return state === 'recording' || state === 'paused'
    default:
      return assertNever(play)
  }
}

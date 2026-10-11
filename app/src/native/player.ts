import { isPlayerState } from './isPlayerState'
import NativeSoundScraper from './NativeSoundScraper'
import type { PlayerState } from './types'

/** Playback of recordings; its events arrive through `recorder.onEvent`. */
export const player = {
  /** Loads a recording, stopped at the start. */
  load: (path: string): Promise<void> => NativeSoundScraper.playerLoad(path),
  unload: (): void => {
    NativeSoundScraper.playerUnload()
  },
  play: (): Promise<void> => NativeSoundScraper.playerPlay(),
  pause: (): void => {
    NativeSoundScraper.playerPause()
  },
  /** Stops and rewinds. */
  stop: (): void => {
    NativeSoundScraper.playerStop()
  },
  seek: (positionMs: number): void => {
    NativeSoundScraper.playerSeek(positionMs)
  },
  /** Unknown states from the native side read as 'empty'. */
  state: (): PlayerState => {
    const state = NativeSoundScraper.playerState()
    return isPlayerState(state) ? state : 'empty'
  },
}

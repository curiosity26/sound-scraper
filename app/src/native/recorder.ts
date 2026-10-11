import type { EventSubscription } from 'react-native'

import { isRecorderState } from './isRecorderState'
import NativeSoundScraper from './NativeSoundScraper'
import type { AudioApp, RecorderEvent, RecorderState } from './types'

export const recorder = {
  /** Starts recording `app`, or all system audio when undefined. */
  start: (app?: AudioApp): Promise<void> =>
    NativeSoundScraper.recorderStart(app?.pid ?? 0),
  pause: (): void => {
    NativeSoundScraper.recorderPause()
  },
  resume: (): void => {
    NativeSoundScraper.recorderResume()
  },
  /** Stops and finalizes; resolves with the .mp3 path. */
  stop: (): Promise<string> => NativeSoundScraper.recorderStop(),
  /** Unknown states from the native side read as 'idle'. */
  state: (): RecorderState => {
    const state = NativeSoundScraper.recorderState()
    return isRecorderState(state) ? state : 'idle'
  },
  onEvent: (listener: (e: RecorderEvent) => void): EventSubscription =>
    NativeSoundScraper.onRecorderEvent(listener),
  /** Finishes recordings left by a crash; returns how many. */
  recoverPartials: (): number => NativeSoundScraper.recoverPartialRecordings(),
}

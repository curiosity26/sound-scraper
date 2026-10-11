import { use } from 'react'

import type { AudioApp, RecorderState } from '@/native/types'
import type { Message } from '@/recorder/types'

import { RecorderSessionContext } from './RecorderSessionContext'

export type UseRecorderSessionResult = {
  readonly state: RecorderState
  /** Waiting for start to resolve (e.g. the permission prompt). */
  readonly starting: boolean
  readonly elapsedMs: number
  /** Linear peak level, 0..1. */
  readonly peak: number
  readonly message: Message | undefined
  /** Recording or paused. */
  readonly active: boolean
  readonly setMessage: (message: Message | undefined) => void
  /** Starts recording the app, or all system audio when undefined. */
  readonly record: (app: AudioApp | undefined) => Promise<void>
  readonly pause: () => void
  readonly resume: () => void
  readonly stop: () => Promise<void>
}

/** The plain UI's recorder: its state, elapsed time, peak level and the
 * latest message, with record/pause/resume/stop. */
export const useRecorderSession = (): UseRecorderSessionResult => {
  const session = use(RecorderSessionContext)
  if (!session) {
    throw new Error('useRecorderSession needs a RecorderSessionProvider')
  }
  return session
}

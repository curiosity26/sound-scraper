import { useSyncExternalStore } from 'react'

import { type RecorderSession, recorderSession } from './recorderSession'

export type UseRecorderSessionResult = RecorderSession & {
  readonly active: boolean
  readonly record: typeof recorderSession.record
  readonly pause: () => void
  readonly resume: () => void
  readonly stop: () => Promise<void>
}

/** The plain UI's recorder: its state, elapsed time, peak level and the
 * latest message, with record/pause/resume/stop. */
export const useRecorderSession = (): UseRecorderSessionResult => {
  const session = useSyncExternalStore(
    recorderSession.subscribe,
    recorderSession.get,
  )
  return {
    ...session,
    active: session.state === 'recording' || session.state === 'paused',
    record: recorderSession.record,
    pause: recorderSession.pause,
    resume: recorderSession.resume,
    stop: recorderSession.stop,
  }
}

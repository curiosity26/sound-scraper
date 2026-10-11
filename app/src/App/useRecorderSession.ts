import { useEffect, useState } from 'react'

import { isRecorderState } from '@/native/isRecorderState'
import { recorder } from '@/native/recorder'
import type { AudioApp, RecorderState } from '@/native/types'
import { rememberSource } from '@/recorder/rememberSource'
import { safeRecover } from '@/recorder/safeRecover'
import { safeState } from '@/recorder/safeState'
import type { Message } from '@/recorder/types'
import { errorText } from '@/utils/errorText'

export type UseRecorderSessionResult = {
  readonly state: RecorderState
  /** Waiting for start to resolve (e.g. the permission prompt). */
  readonly starting: boolean
  readonly elapsedMs: number
  /** Linear peak level, 0..1. */
  readonly peak: number
  readonly message: Message | undefined
  readonly setMessage: (message: Message | undefined) => void
  /** Starts recording the app, or all system audio when undefined. */
  readonly record: (app: AudioApp | undefined) => Promise<void>
  readonly pause: () => void
  readonly resume: () => void
  readonly stop: () => Promise<void>
}

/**
 * The recorder for the plain UI: its state, elapsed time, peak level and
 * the latest message, with record/pause/resume/stop. Recovers interrupted
 * recordings on first use.
 */
export const useRecorderSession = (): UseRecorderSessionResult => {
  const [state, setState] = useState<RecorderState>(() => safeState())
  const [starting, setStarting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [peak, setPeak] = useState(0)
  const [message, setMessage] = useState<Message>()

  useEffect(() => {
    const recovered = safeRecover()
    if (recovered > 0) {
      setMessage({
        text: `Recovered ${recovered} interrupted recording${
          recovered === 1 ? '' : 's'
        }.`,
        isError: false,
      })
    }
    const subscription = recorder.onEvent(e => {
      switch (e.kind) {
        case 'state':
          if (isRecorderState(e.state)) {
            setState(e.state)
          }
          if (e.state === 'idle') {
            setPeak(0)
          }
          break
        case 'progress':
          setElapsedMs(e.elapsedMs)
          setPeak(e.peak)
          break
        case 'finished':
          setMessage({ text: `Saved ${e.path}`, isError: false })
          break
        case 'error':
          setMessage({ text: `Recording failed: ${e.message}`, isError: true })
          break
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])

  const record = async (app: AudioApp | undefined) => {
    setStarting(true)
    setMessage(undefined)
    setElapsedMs(0)
    try {
      await recorder.start(app)
      rememberSource(app)
    } catch (e) {
      setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true })
    } finally {
      setStarting(false)
    }
  }

  const stop = async () => {
    try {
      await recorder.stop()
    } catch (e) {
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true })
    }
  }

  return {
    state,
    starting,
    elapsedMs,
    peak,
    message,
    setMessage,
    record,
    pause: recorder.pause,
    resume: recorder.resume,
    stop,
  }
}

import { useEffect, useState } from 'react'

import { isRecorderState } from '@/native/guards/isRecorderState'
import { recorder } from '@/native/recorder'
import type { AudioApp, RecorderState } from '@/native/types'
import { rememberSource } from '@/recorder/rememberSource'
import { safeRecover } from '@/recorder/safeRecover'
import { safeState } from '@/recorder/safeState'
import type { Message } from '@/recorder/types'
import { errorText } from '@/utils/errorText'

import type { UseRecorderSessionResult } from './useRecorderSession'

type Progress = { readonly elapsedMs: number; readonly peak: number }

/**
 * Owns the recorder session for RecorderSessionProvider: follows the
 * recorder's events while mounted and recovers interrupted recordings on
 * mount.
 */
export const useRecorderSessionState = (): UseRecorderSessionResult => {
  const [state, setState] = useState<RecorderState>(safeState)
  const [starting, setStarting] = useState(false)
  const [progress, setProgress] = useState<Progress>({
    elapsedMs: 0,
    peak: 0,
  })
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
            setProgress(p => ({ ...p, peak: 0 }))
          }
          break
        case 'progress':
          setProgress({ elapsedMs: e.elapsedMs, peak: e.peak })
          break
        case 'finished':
          setMessage({ text: `Saved ${e.path}`, isError: false })
          break
        case 'error':
          setMessage({ text: `Recording failed: ${e.message}`, isError: true })
          break
        case 'playerState':
        case 'playerProgress':
        case 'playerError':
          // Playback's events: the playback store follows them.
          break
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])

  return {
    state,
    starting,
    elapsedMs: progress.elapsedMs,
    peak: progress.peak,
    message,
    active: state === 'recording' || state === 'paused',
    setMessage,
    record: async (app: AudioApp | undefined) => {
      setStarting(true)
      setMessage(undefined)
      setProgress(p => ({ ...p, elapsedMs: 0 }))
      try {
        await recorder.start(app)
        rememberSource(app)
      } catch (e) {
        setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true })
      } finally {
        setStarting(false)
      }
    },
    pause: recorder.pause,
    resume: recorder.resume,
    stop: async () => {
      try {
        await recorder.stop()
      } catch (e) {
        setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true })
      }
    },
  }
}

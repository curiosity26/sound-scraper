// The plain UI's recorder session, shared by the record bar, the source
// picker and the message line. Subscribes to the recorder's events while
// anything is listening, and recovers interrupted recordings on first use.
import { isRecorderState } from '@/native/isRecorderState'
import { recorder } from '@/native/recorder'
import type { AudioApp, RecorderState } from '@/native/types'
import { rememberSource } from '@/recorder/rememberSource'
import { safeRecover } from '@/recorder/safeRecover'
import { safeState } from '@/recorder/safeState'
import type { Message } from '@/recorder/types'
import { errorText } from '@/utils/errorText'

export type RecorderSession = {
  readonly state: RecorderState
  /** Waiting for start to resolve (e.g. the permission prompt). */
  readonly starting: boolean
  readonly elapsedMs: number
  /** Linear peak level, 0..1. */
  readonly peak: number
  readonly message: Message | undefined
}

let current: RecorderSession | undefined
let recovered = false
let subscription: { remove: () => void } | undefined
const listeners = new Set<() => void>()

const get = (): RecorderSession => {
  current ??= {
    state: safeState(),
    starting: false,
    elapsedMs: 0,
    peak: 0,
    message: undefined,
  }
  return current
}

const update = (change: Partial<RecorderSession>) => {
  current = { ...get(), ...change }
  listeners.forEach(l => {
    l()
  })
}

const start = () => {
  if (!recovered) {
    recovered = true
    const count = safeRecover()
    if (count > 0) {
      update({
        message: {
          text: `Recovered ${count} interrupted recording${
            count === 1 ? '' : 's'
          }.`,
          isError: false,
        },
      })
    }
  }
  subscription = recorder.onEvent(e => {
    switch (e.kind) {
      case 'state':
        if (isRecorderState(e.state)) {
          update({ state: e.state })
        }
        if (e.state === 'idle') {
          update({ peak: 0 })
        }
        break
      case 'progress':
        update({ elapsedMs: e.elapsedMs, peak: e.peak })
        break
      case 'finished':
        update({ message: { text: `Saved ${e.path}`, isError: false } })
        break
      case 'error':
        update({
          message: { text: `Recording failed: ${e.message}`, isError: true },
        })
        break
    }
  })
}

export const recorderSession = {
  get,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    if (listeners.size === 1) {
      start()
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        subscription?.remove()
        subscription = undefined
      }
    }
  },
  setMessage: (message: Message | undefined) => {
    update({ message })
  },
  /** Starts recording the app, or all system audio when undefined. */
  record: async (app: AudioApp | undefined) => {
    update({ starting: true, message: undefined, elapsedMs: 0 })
    try {
      await recorder.start(app)
      rememberSource(app)
    } catch (e) {
      update({
        message: { text: `Couldn't start: ${errorText(e)}`, isError: true },
      })
    } finally {
      update({ starting: false })
    }
  },
  pause: () => {
    recorder.pause()
  },
  resume: () => {
    recorder.resume()
  },
  stop: async () => {
    try {
      await recorder.stop()
    } catch (e) {
      update({
        message: { text: `Couldn't save: ${errorText(e)}`, isError: true },
      })
    }
  },
}

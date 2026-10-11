import { useEffect, useState } from 'react'

import { burnApi } from '@/burn/burnApi'
import { burnJob } from '@/burn/burnJob'
import { isRunning } from '@/burn/isRunning'
import type { BurnJob, BurnStatus } from '@/burn/types'
import { pickSaveFile } from '@/native/pickSaveFile'
import { burnTarget } from '@/skin/burnTarget'
import { errorText } from '@/utils/errorText'

import { speedText } from './speedText'

export type UseBurnProgressStateResult = {
  /** The core's status, polled 5 times a second while it runs. */
  readonly status: BurnStatus | null
  /** The last error, from polling or from a button. */
  readonly error: string | undefined
  readonly running: boolean
  /** Writing a disc image, not a CD. */
  readonly image: boolean
  /** The saved image, once it's done. */
  readonly output: string | null
  readonly headline: string
  /** The log, each line stamped with its time of day. */
  readonly logLines: readonly string[]
  /** Forgets the job; the panel goes back to the setup. */
  readonly close: () => void
  /** Closes the job and sets the same playlist up again. */
  readonly again: () => void
  readonly saveLog: () => void
  readonly cancel: () => void
  /** Shows the saved image in Finder or Explorer. */
  readonly reveal: () => void
}

/** "Burned 12 tracks to CD", "Writing track 3 at 24x (…)", … */
const headlineOf = (status: BurnStatus | null, name: string): string => {
  const image = status?.kind === 'image'
  const speed = speedText(status?.speedX ?? null)
  const verb = status?.testWrite ? 'Test write' : image ? 'Image' : 'Burn'
  return !status
    ? 'Starting…'
    : status.state === 'done'
    ? image
      ? `Saved ${name}.cue`
      : status.testWrite
      ? 'Test write finished: the disc would burn fine'
      : `Burned ${status.tracks.length} tracks to CD`
    : status.state === 'failed'
    ? `${verb} failed`
    : status.state === 'cancelled'
    ? `${verb} cancelled`
    : speed && status.state === 'writing'
    ? `${status.phase} at ${speed}`
    : status.phase
}

/**
 * The burn job `current`: its status, polled, and what can be done with it.
 * Progress owns it and shares it through BurnProgressContext.
 */
export const useBurnProgressState = (
  current: BurnJob,
): UseBurnProgressStateResult => {
  const [status, setStatus] = useState<BurnStatus | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    const poll = () => {
      try {
        const s = burnApi.status(current.id)
        if (alive) {
          setStatus(s)
        }
        return isRunning(s)
      } catch (e) {
        setError(errorText(e))
        return false
      }
    }
    if (!poll()) {
      return
    }
    const timer = setInterval(() => {
      if (!poll()) {
        clearInterval(timer)
      }
    }, 200)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [current.id])

  const image = status?.kind === 'image'
  const output = status?.state === 'done' && image ? status.output : null
  const started = current.started
  const stamp = (atMs: number) => {
    const d = new Date(started + atMs)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  const close = () => {
    try {
      burnApi.close(current.id)
    } catch {}
    burnJob.set(null)
  }

  return {
    status,
    error,
    running: isRunning(status),
    image,
    output,
    headline: headlineOf(status, current.target.name),
    logLines: (status?.log ?? []).map(l => `${stamp(l.atMs)} ${l.text}`),
    close,
    again: () => {
      close()
      burnTarget.set({ ...current.target })
    },
    saveLog: () => {
      void (async () => {
        try {
          const path = await pickSaveFile(
            'Save burn log',
            `${current.target.name} burn log.txt`,
            'txt',
          )
          if (path) {
            burnApi.saveLog(current.id, path)
          }
        } catch (e) {
          setError(errorText(e))
        }
      })()
    },
    cancel: () => {
      try {
        burnApi.cancel(current.id)
      } catch (e) {
        setError(errorText(e))
      }
    },
    reveal: () => {
      if (!output) {
        return
      }
      try {
        burnApi.reveal(output)
      } catch (e) {
        setError(errorText(e))
      }
    },
  }
}

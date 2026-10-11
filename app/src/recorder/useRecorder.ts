import { useCallback, useEffect, useState } from 'react'

import { selection } from '@/library/selection'
import { isRecorderState } from '@/native/isRecorderState'
import { recorder } from '@/native/recorder'
import type { AudioApp, RecorderState } from '@/native/types'
import { playback } from '@/playback/playback'
import { playlists } from '@/playlists/playlists'
import { errorText } from '@/utils/errorText'

import { SILENT } from './constants'
import { rememberedPid } from './rememberedPid'
import { rememberSource } from './rememberSource'
import { safeList } from './safeList'
import { safeRecover } from './safeRecover'
import { safeState } from './safeState'
import type { Levels, Message } from './types'

export type UseRecorderResult = {
  readonly apps: readonly AudioApp[]
  readonly refreshApps: () => AudioApp[]
  readonly selectedPid: number
  readonly setSelectedPid: (pid: number) => void
  readonly sourceName: string
  readonly state: RecorderState
  readonly starting: boolean
  readonly elapsedMs: number
  readonly levels: Levels
  readonly message: Message | undefined
  readonly setMessage: (message: Message | undefined) => void
  readonly record: () => Promise<void>
  readonly pause: () => void
  readonly resume: () => void
  readonly stop: () => Promise<void>
}

/**
 * Recorder state and actions for the skinned main panel: the capture
 * source, record/pause/resume/stop, elapsed time, levels and the latest
 * message. Recovers interrupted recordings on first use.
 */
export const useRecorder = (): UseRecorderResult => {
  const [apps, setApps] = useState<AudioApp[]>(() => safeList())
  const [selectedPid, setSelectedPid] = useState(() => rememberedPid(apps))
  const [state, setState] = useState<RecorderState>(() => safeState())
  const [starting, setStarting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [levels, setLevels] = useState(SILENT)
  const [message, setMessage] = useState<Message>()

  useEffect(() => {
    const recovered = safeRecover()
    if (recovered > 0) {
      setMessage({
        text: `Recovered ${recovered} interrupted recording${
          recovered === 1 ? '' : 's'
        }`,
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
            setLevels(SILENT)
          }
          break
        case 'progress':
          setElapsedMs(e.elapsedMs)
          setLevels({
            peak: e.peak,
            rms: e.rms,
            left: e.peakLeft ?? e.peak,
            right: e.peakRight ?? e.peak,
            rmsLeft: e.rmsLeft ?? e.rms,
            rmsRight: e.rmsRight ?? e.rms,
          })
          break
        case 'finished':
          setMessage({
            text: `Saved ${baseName(e.path ?? '')}`,
            isError: false,
          })
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

  const refreshApps = useCallback(() => {
    const list = safeList()
    setApps(list)
    return list
  }, [])

  const record = useCallback(async () => {
    setStarting(true)
    setMessage(undefined)
    setElapsedMs(0)
    // A new track: the one loaded for playback is unloaded by the core and
    // deselected here.
    selection.set([])
    try {
      const app = apps.find(a => a.pid === selectedPid)
      await recorder.start(app)
      rememberSource(app)
    } catch (e) {
      setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true })
    } finally {
      setStarting(false)
    }
  }, [apps, selectedPid])

  const stop = useCallback(async () => {
    let path: string
    try {
      path = await recorder.stop()
    } catch (e) {
      // Includes a recording of only silence, which leaves no file.
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true })
      return
    }
    // Into the playlist showing in the library, if any.
    try {
      playlists.recorded(baseName(path))
    } catch (e) {
      setMessage({
        text: `Saved, but couldn't add it to the playlist: ${errorText(e)}`,
        isError: true,
      })
    }
    await playback.recorded(path)
  }, [])

  const sourceName =
    selectedPid === 0
      ? 'All system audio'
      : apps.find(a => a.pid === selectedPid)?.name ?? 'All system audio'

  return {
    apps,
    refreshApps,
    selectedPid,
    setSelectedPid,
    sourceName,
    state,
    starting,
    elapsedMs,
    levels,
    message,
    setMessage,
    record,
    pause: recorder.pause,
    resume: recorder.resume,
    stop,
  }
}

const baseName = (path: string): string => {
  return path.split(/[\\/]/).pop() ?? path
}

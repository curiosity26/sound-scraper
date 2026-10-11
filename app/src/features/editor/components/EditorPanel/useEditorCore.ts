// The native editor for the recording: opened for the editor's lifetime,
// polled while it reads the waveform.
import { useEffect, useMemo, useState } from 'react'

import type { WaveformStatus } from '@/bridge/generated'
import { editorCore } from '@/features/editor/editorCore'

import type { EditorTarget, FrameGrid } from './types'

export type UseEditorCoreResult = {
  /** The native editor (0 until it's open, or if it couldn't open). */
  readonly editorId: number
  readonly status: WaveformStatus
  /** The recording's length (the target's until the waveform is read). */
  readonly durationMs: number
  readonly ready: boolean
  /** A lossless master exists: every cut is exact. */
  readonly hasMaster: boolean
  /** MP3 frame boundaries, when there's no master to cut from. */
  readonly frames: FrameGrid | null
}

export const useEditorCore = (target: EditorTarget): UseEditorCoreResult => {
  const [editorId, setEditorId] = useState(0)
  const [status, setStatus] = useState<WaveformStatus>({
    state: 'loading',
    progress: 0,
  })
  useEffect(() => {
    const id = editorCore.open(target.path)
    setEditorId(id)
    setStatus(
      id
        ? { state: 'loading', progress: 0 }
        : { state: 'failed', message: "Couldn't open the recording." },
    )
    return () => {
      editorCore.close(id)
    }
  }, [target.path])
  useEffect(() => {
    if (!editorId) {
      return
    }
    const poll = () => {
      const s = editorCore.status(editorId)
      setStatus(s)
      return s.state === 'loading'
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
      clearInterval(timer)
    }
  }, [editorId])
  const frames = useMemo(
    () =>
      status.state === 'ready' && !status.master && status.frameMs
        ? { frameMs: status.frameMs, offsetMs: status.frameOffsetMs ?? 0 }
        : null,
    [status],
  )
  return {
    editorId,
    status,
    durationMs:
      status.state === 'ready' ? status.durationMs : target.durationMs,
    ready: status.state === 'ready',
    hasMaster: status.state === 'ready' && status.master,
    frames,
  }
}

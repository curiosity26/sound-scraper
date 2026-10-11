// Playing the recording from the editor: loading it into the player on
// first use, previews and scrub snippets that stop on their own, and
// skipping deleted stretches while it plays.
import { useEffect, useRef } from 'react'

import { usePlayback } from '@/hooks/usePlayback'
import { playback } from '@/playback/playback'

import { deletedAt, type Edits } from './model'
import type { EditorTarget } from './types'

/** P plays this much either side of the selected slice. */
const PREVIEW_MS = 2000

export type UseEditorTransportResult = {
  /** The player has this recording. */
  readonly loaded: boolean
  readonly playing: boolean
  /** Where the player is (0 when it has another recording). */
  readonly playheadMs: number
  readonly playPause: () => Promise<void>
  /** Moves the playhead (loading the recording first if needed). */
  readonly seek: (ms: number) => Promise<void>
  readonly stop: () => void
  /** Plays a couple of seconds either side of a point, then pauses. */
  readonly previewAround: (atMs: number) => Promise<void>
  /** Pauses after a while (unless something cancels it first). */
  readonly pauseAfter: (ms: number) => void
  readonly cancelPauseTimer: () => void
}

export const useEditorTransport = (
  target: EditorTarget,
  durationMs: number,
  edits: Edits,
): UseEditorTransportResult => {
  const pb = usePlayback()
  const loaded = pb.path === target.path

  const ensureLoaded = async () => {
    if (!loaded) {
      await playback.select({
        fileName: target.fileName,
        path: target.path,
        title: target.title,
        artist: null,
        album: null,
        durationMs,
        sizeBytes: 0,
        recordedAtMs: 0,
      })
    }
  }
  const playPause = async () => {
    await ensureLoaded()
    if (playback.get().state === 'playing') {
      playback.pause()
    } else {
      await playback.play()
    }
  }
  const seek = async (ms: number) => {
    await ensureLoaded()
    playback.seek(Math.max(0, Math.min(ms, durationMs)))
  }

  // Stops a preview or a scrub snippet after a while.
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseAfter = (ms: number) => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current)
    }
    stopTimer.current = setTimeout(() => {
      stopTimer.current = null
      playback.pause()
    }, ms)
  }
  const cancelPauseTimer = () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current)
      stopTimer.current = null
    }
  }
  useEffect(() => cancelPauseTimer, [])

  // Deleted stretches are skipped while playing.
  useEffect(() => {
    if (loaded && pb.state === 'playing') {
      const r = deletedAt(edits, pb.positionMs)
      if (r) {
        playback.seek(Math.min(r.endMs, durationMs))
      }
    }
  }, [loaded, pb.state, pb.positionMs, edits, durationMs])

  return {
    loaded,
    playing: loaded && pb.state === 'playing',
    playheadMs: loaded ? pb.positionMs : 0,
    playPause,
    seek,
    stop: () => {
      if (loaded) {
        playback.stop()
      }
    },
    previewAround: async atMs => {
      await seek(atMs - PREVIEW_MS)
      await playback.play()
      pauseAfter(Math.min(atMs, PREVIEW_MS) + PREVIEW_MS)
    },
    pauseAfter,
    cancelPauseTimer,
  }
}

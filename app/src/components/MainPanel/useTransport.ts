import { useState } from 'react'

import { usePlayback } from '@/hooks/usePlayback'
import type { PlayerState, RecorderState } from '@/native/types'
import { type Playback, playback } from '@/playback/playback'
import type { Levels } from '@/recorder/types'
import type { SkinLayout } from '@/skin/types'
import { windows } from '@/skin/windows'

import { playbackStatusText } from './playbackStatusText'
import { statusText } from './statusText'
import type { ButtonSpec } from './types'
import { useRecorder, type UseRecorderResult } from './useRecorder'

export type UseTransportResult = {
  readonly recorder: UseRecorderResult
  readonly playback: Playback
  /** Recording or paused. */
  readonly active: boolean
  /** Starting or saving a recording. */
  readonly busy: boolean
  /**
   * A recording loaded for playback, and no recording running: the
   * displays show the playback.
   */
  readonly loaded: boolean
  readonly playing: boolean
  readonly record: ButtonSpec
  readonly play: ButtonSpec
  readonly pause: ButtonSpec
  readonly stop: ButtonSpec
  /** Stops a recording first. */
  readonly quit: ButtonSpec
  /** The state animations follow. */
  readonly tapeState: RecorderState
  readonly status: {
    readonly text: string
    /** A recorder state, or a player state during playback. */
    readonly state: RecorderState | PlayerState
  }
  readonly levels: Levels
  readonly elapsedMs: number
  readonly seek: {
    readonly positionMs: number
    readonly durationMs: number
    readonly enabled: boolean
    readonly onScrub: (positionMs: number | undefined) => void
    readonly onSeek: (positionMs: number) => void
  }
}

/**
 * The tape transport: the recorder and the playback behind the record,
 * play, pause and stop buttons, and what the time, status and level
 * displays show.
 */
export const useTransport = (
  elements: SkinLayout['elements'],
): UseTransportResult => {
  const r = useRecorder()
  const p = usePlayback()
  const [scrubMs, setScrubMs] = useState<number>()

  const active = r.state === 'recording' || r.state === 'paused'
  const busy = r.starting || r.state === 'finalizing'
  // A recording loaded for playback, and no recording running: the
  // displays show the playback.
  const loaded = p.state !== 'empty' && !active && !busy
  const playing = loaded && p.state === 'playing'

  // Record starts a new recording (unloading what was loaded for
  // playback). Play is pause while recording or playing, and resumes a
  // paused recording; record is disabled meanwhile. Skins without a play
  // element (made before playback) keep record as pause too, unless they
  // have a separate pause element.
  const hasPlay = elements.play != null
  const pauseSeparate = elements.pause != null || hasPlay
  const onRecord = () => {
    if (r.state === 'idle') {
      void r.record()
    } else if (hasPlay) {
      return
    } else if (r.state === 'paused') {
      r.resume()
    } else if (r.state === 'recording' && !pauseSeparate) {
      r.pause()
    }
  }
  const onPlay = () => {
    if (r.state === 'recording') {
      r.pause()
    } else if (r.state === 'paused') {
      r.resume()
    } else if (playing) {
      playback.pause()
    } else if (loaded) {
      void playback.play()
    }
  }
  const onPause = () => {
    if (active) {
      if (r.state === 'paused') {
        r.resume()
      } else {
        r.pause()
      }
    } else if (playing) {
      playback.pause()
    } else if (loaded && p.state === 'paused') {
      void playback.play()
    }
  }
  const onStop = () => {
    if (active) {
      void r.stop()
    } else if (loaded) {
      playback.stop()
    }
  }
  const close = async () => {
    if (active) {
      await r.stop()
    }
    windows.quit()
  }
  const stoppable =
    active || (loaded && (p.state !== 'stopped' || p.positionMs > 0))
  const recordMode =
    r.state === 'paused'
      ? 'paused'
      : r.state === 'recording'
      ? 'recording'
      : undefined
  const recordLabel = hasPlay
    ? 'Record'
    : r.state === 'paused'
    ? 'Resume'
    : r.state === 'recording' && !pauseSeparate
    ? 'Pause'
    : 'Record'
  const playMode =
    r.state === 'recording' || r.state === 'paused'
      ? r.state
      : playing
      ? 'playing'
      : undefined
  const playLabel =
    r.state === 'paused'
      ? 'Resume'
      : r.state === 'recording' || playing
      ? 'Pause'
      : 'Play'
  const paused = r.state === 'paused' || (loaded && p.state === 'paused')
  // Animations follow the tape: recording, or playing back.
  const tapeState: RecorderState = playing
    ? 'recording'
    : loaded && p.state === 'paused'
    ? 'paused'
    : r.state

  return {
    recorder: r,
    playback: p,
    active,
    busy,
    loaded,
    playing,
    record: {
      label: recordLabel,
      onPress: onRecord,
      mode: recordMode,
      disabled: busy || (hasPlay && active),
    },
    play: {
      label: playLabel,
      onPress: onPlay,
      mode: playMode,
      disabled: busy || (!active && !loaded),
    },
    pause: {
      label: paused ? 'Resume' : 'Pause',
      onPress: onPause,
      active: paused,
      disabled: !active && !(loaded && p.state !== 'stopped'),
    },
    stop: { label: 'Stop', onPress: onStop, disabled: !stoppable },
    quit: {
      label: 'Quit',
      onPress: () => {
        void close()
      },
    },
    tapeState,
    status: loaded
      ? { text: playbackStatusText(p.state), state: p.state }
      : {
          text: statusText(r.state, r.starting),
          state: r.starting ? 'recording' : r.state,
        },
    levels: loaded ? p.levels : r.levels,
    elapsedMs: loaded ? scrubMs ?? p.positionMs : r.elapsedMs,
    seek: {
      positionMs: p.positionMs,
      durationMs: p.durationMs,
      enabled: loaded,
      onScrub: setScrubMs,
      onSeek: playback.seek,
    },
  }
}

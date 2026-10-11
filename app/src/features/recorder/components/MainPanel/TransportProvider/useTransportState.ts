import { useState } from 'react'

import type { ResolvedLayout } from '@/bridge/generated'
import type { RecorderState } from '@/bridge/types'
import { usePlayback } from '@/features/playback/hooks/usePlayback'
import { playback } from '@/features/playback/playback'
import type { Transport } from '@/features/recorder/components/MainPanel/types'
import { windows } from '@/features/skins/windows'

import { playbackStatusText } from './playbackStatusText'
import { statusText } from './statusText'
import { useRecorder } from './useRecorder'
import { useShownMessage } from './useShownMessage'

export type UseTransportStateResult = Transport

/**
 * The tape transport: the recorder and the playback behind the record,
 * play, pause and stop buttons, and what the time, status, level and
 * source displays show.
 */
export const useTransportState = (
  elements: ResolvedLayout['elements'],
): UseTransportStateResult => {
  const r = useRecorder()
  const p = usePlayback()
  const [scrubMs, setScrubMs] = useState<number>()
  const { shownMessage, dismissMessage } = useShownMessage(r.message)

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
    shownMessage,
    dismissMessage,
  }
}

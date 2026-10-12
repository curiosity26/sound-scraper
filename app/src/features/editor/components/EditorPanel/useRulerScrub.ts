// The ruler: click to move the playhead; drag to scrub (short snippets
// play from wherever the pointer is).
import { useRef, useState } from 'react'
import type { GestureResponderEvent } from 'react-native'

import { playback } from '@/features/playback/playback'
import { onRejected } from '@/shared/utils/onRejected'

import type { ResponderProps } from './types'
import type { UseEditorTransportResult } from './useEditorTransport'
import { warnPlaybackFailed } from './warnPlaybackFailed'

/** Snippets played while scrubbing, and the stop after the pointer rests. */
const SCRUB_INTERVAL_MS = 60
const SCRUB_REST_MS = 150

export type UseRulerScrubOptions = {
  readonly transport: UseEditorTransportResult
  /** The zoom, in ms per point. */
  readonly scale: number
  readonly snapMs: (ms: number) => number
  /** Presses start a scrub (the waveform is read and no dialog is up). */
  readonly enabled: boolean
  /** Called first on a press (closes the name field, takes the keys…). */
  readonly onPress: () => void
}

export type UseRulerScrubResult = {
  /** Where the pointer is while scrubbing. */
  readonly scrubMs: number | null
  readonly rulerResponder: ResponderProps
}

export const useRulerScrub = (
  options: UseRulerScrubOptions,
): UseRulerScrubResult => {
  const { transport, scale, snapMs } = options
  const scrub = useRef({
    active: false,
    wasPlaying: false,
    x0: 0,
    from: 0,
    last: 0,
  })
  const [scrubMs, setScrubMs] = useState<number | null>(null)
  const grant = (e: GestureResponderEvent) => {
    options.onPress()
    transport.cancelPauseTimer()
    const from = snapMs(e.nativeEvent.locationX * scale)
    scrub.current = {
      active: true,
      wasPlaying: transport.playing,
      x0: e.nativeEvent.pageX,
      from,
      last: 0,
    }
    setScrubMs(from)
    transport.seek(from)
  }
  const move = async (e: GestureResponderEvent) => {
    const sc = scrub.current
    if (!sc.active) {
      return
    }
    const ms = snapMs(sc.from + (e.nativeEvent.pageX - sc.x0) * scale)
    setScrubMs(ms)
    const now = Date.now()
    if (now - sc.last < SCRUB_INTERVAL_MS) {
      return
    }
    sc.last = now
    playback.seek(ms)
    if (playback.get().state !== 'playing') {
      await playback.play()
    }
    if (!sc.wasPlaying) {
      transport.pauseAfter(SCRUB_REST_MS)
    }
  }
  const release = () => {
    const sc = scrub.current
    if (!sc.active) {
      return
    }
    sc.active = false
    if (scrubMs !== null) {
      playback.seek(scrubMs)
    }
    setScrubMs(null)
    if (!sc.wasPlaying) {
      transport.cancelPauseTimer()
      playback.pause()
    }
  }
  return {
    scrubMs,
    rulerResponder: {
      onStartShouldSetResponder: () => options.enabled,
      onResponderGrant: e => {
        grant(e)
      },
      onResponderMove: e => {
        move(e).catch(onRejected(warnPlaybackFailed))
      },
      onResponderRelease: release,
      onResponderTerminate: release,
      onResponderTerminationRequest: () => false,
    },
  }
}

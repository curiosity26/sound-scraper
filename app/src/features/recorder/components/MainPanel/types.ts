import type { PlayerState, RecorderState } from '@/bridge/types'
import type { Playback } from '@/features/playback/playback'
import type { Levels, Message } from '@/features/recorder/types'

import type { UseRecorderResult } from './TransportProvider'

/** What a skin button shows and does (see SkinButton). */
export type ButtonSpec = {
  readonly label: string
  readonly onPress: () => void
  /** Latched on (a panel open…). */
  readonly active?: boolean
  readonly disabled?: boolean
  /** A mode with its own look, e.g. "recording". */
  readonly mode?: string
}

/** The transport's buttons (see TransportButton). */
export type TransportControl = 'record' | 'play' | 'pause' | 'stop' | 'quit'

/**
 * The tape transport (see TransportProvider): the recorder and the
 * playback behind the record, play, pause and stop buttons, and what the
 * time, status, level and source displays show.
 */
export type Transport = Readonly<Record<TransportControl, ButtonSpec>> & {
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
  /** The latest message, for a while after it arrives (source display). */
  readonly shownMessage: Message | undefined
  /** Stops showing the message early. */
  readonly dismissMessage: () => void
}

import type { ViewProps } from 'react-native'

import type { EditorTrack } from '@/native/bridge'

export type EditorTheme = {
  background: string
  /** Hovered and latched tools. */
  raised: string
  /** Inset fields (steppers). */
  well: string
  text: string
  dim: string
  border: string
  accent: string
  accentText: string
  lcd: string
  lcdText: string
  /** The waveform colors, by name. */
  wave: (name: string, fallback: string) => string
}

/** The recording the editor is open on. */
export type EditorTarget = {
  fileName: string
  path: string
  title: string
  durationMs: number
}

/** Who a name belongs to: a slice (by id), or the first track. */
export type Naming = number | 'first'

/** A stretch of the recording, in ms. */
export type TimeRange = { startMs: number; endMs: number }

/** MP3 frame boundaries (where lossless cuts land). */
export type FrameGrid = { frameMs: number; offsetMs: number }

/** A tick on the ruler. */
export type RulerTick = { ms: number; major: boolean }

/** A track with who names it (its slice, or the first track). */
export type TrackRow = EditorTrack & {
  /** Who names it: a slice id, or the first track. */
  owner: Naming | null
  name: string
}

/** What Delete would act on. */
export type DeleteTarget = 'selection' | 'slice' | 'region' | null

/** The responder props a press-and-drag area takes. */
export type ResponderProps = Pick<
  ViewProps,
  | 'onStartShouldSetResponder'
  | 'onResponderGrant'
  | 'onResponderMove'
  | 'onResponderRelease'
  | 'onResponderTerminate'
  | 'onResponderTerminationRequest'
>

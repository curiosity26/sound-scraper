import type { DetectOptions } from '@/native/types'

/** Colors for the tracks, in order (muted, like Logic's regions). */
export const TRACK_COLORS = [
  '#5b8def',
  '#e0a63b',
  '#58b368',
  '#c46fd8',
  '#e2685f',
  '#4cb7c2',
] as const

export const OVERVIEW = 30

/** Auto Slice's presets, in the order they're offered. */
export const DETECT_PRESET_NAMES = ['digital', 'vinyl'] as const

export const DETECT_PRESETS: Record<
  (typeof DETECT_PRESET_NAMES)[number],
  Omit<DetectOptions, 'removeGaps'>
> = {
  // Streams and files: the gaps are digital silence.
  digital: { thresholdDb: -60, minGapMs: 1500, minTrackMs: 10_000 },
  // Vinyl, tape, radio: noise between songs.
  vinyl: { thresholdDb: -40, minGapMs: 1500, minTrackMs: 10_000 },
}

export const MONO = 'Menlo'

/** The time ruler's height. */
export const RULER = 22
/** The lane of track regions under the ruler. */
export const LANE = 22
/** The grab area either side of a slice. */
export const HANDLE = 10
/** The vertical zoom beside the waveform. */
export const VSTRIP = 26

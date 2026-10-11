import type { DetectOptions } from '@/native/types'

/** Colors for the tracks, in order (muted, like Logic's regions). */
export const TRACK_COLORS = [
  '#5b8def',
  '#e0a63b',
  '#58b368',
  '#c46fd8',
  '#e2685f',
  '#4cb7c2',
]

export const OVERVIEW = 30

export const DETECT_PRESETS: Record<
  'digital' | 'vinyl',
  Omit<DetectOptions, 'removeGaps'>
> = {
  // Streams and files: the gaps are digital silence.
  digital: { thresholdDb: -60, minGapMs: 1500, minTrackMs: 10_000 },
  // Vinyl, tape, radio: noise between songs.
  vinyl: { thresholdDb: -40, minGapMs: 1500, minTrackMs: 10_000 },
}

export const MONO = 'Menlo'

import type { DetectOptions } from '@/native/types'

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

/** The vertical zoom beside the waveform. */
export const VSTRIP = 26

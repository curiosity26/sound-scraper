import type { RecorderState } from './types'

export const isRecorderState = (value: string): value is RecorderState =>
  value === 'idle' ||
  value === 'recording' ||
  value === 'paused' ||
  value === 'finalizing'

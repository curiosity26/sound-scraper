import type { TrackState } from '@/burn/types'

export const TRACK_WORDS: Record<TrackState, string> = {
  waiting: 'Waiting',
  preparing: 'Preparing',
  ready: 'Ready',
  writing: 'Writing',
  done: 'Done',
  failed: 'Failed',
}

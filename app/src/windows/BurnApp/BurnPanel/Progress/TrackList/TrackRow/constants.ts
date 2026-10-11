import type { BurnTrackStatus } from '@/native/bridge'

export const TRACK_WORDS: Record<BurnTrackStatus['state'], string> = {
  waiting: 'Waiting',
  preparing: 'Preparing',
  ready: 'Ready',
  writing: 'Writing',
  done: 'Done',
  failed: 'Failed',
}

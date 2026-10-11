import type { RecorderState } from '@/bridge/types'

export const statusText = (state: RecorderState, starting: boolean): string => {
  if (starting) {
    return 'STARTING'
  }
  switch (state) {
    case 'recording':
      return '● REC'
    case 'paused':
      return '⏸ PAUSED'
    case 'finalizing':
      return 'SAVING'
    default:
      return 'READY'
  }
}

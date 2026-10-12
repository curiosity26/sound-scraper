import type { RecorderState } from '@/bridge/types'
import { assertNever } from '@/shared/utils/assertNever'

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
    case 'idle':
      return 'READY'
    default:
      return assertNever(state)
  }
}

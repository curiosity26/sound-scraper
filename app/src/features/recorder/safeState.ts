import type { RecorderState } from '@/bridge/types'

import { recorder } from './recorder'

export const safeState = (): RecorderState => {
  try {
    return recorder.state()
  } catch {
    return 'idle'
  }
}

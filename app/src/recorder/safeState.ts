import { recorder } from '@/native/recorder'
import type { RecorderState } from '@/native/types'

export function safeState(): RecorderState {
  try {
    return recorder.state()
  } catch {
    return 'idle'
  }
}

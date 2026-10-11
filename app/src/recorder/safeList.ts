import { listAudioApps } from '@/native/listAudioApps'
import type { AudioApp } from '@/native/types'

export const safeList = (): AudioApp[] => {
  try {
    return listAudioApps()
  } catch {
    return []
  }
}

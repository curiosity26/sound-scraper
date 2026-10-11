import type { AudioApp } from '@/bridge/types'

import { listAudioApps } from './listAudioApps'

export const safeList = (): AudioApp[] => {
  try {
    return listAudioApps()
  } catch {
    return []
  }
}

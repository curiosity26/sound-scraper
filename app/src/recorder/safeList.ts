import { listAudioApps } from '@/native/listAudioApps'
import type { AudioApp } from '@/native/types'

export function safeList(): AudioApp[] {
  try {
    return listAudioApps()
  } catch {
    return []
  }
}

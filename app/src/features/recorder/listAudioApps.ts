import { NativeSoundScraper } from '@/bridge/NativeSoundScraper'
import type { AudioApp } from '@/bridge/types'

export const listAudioApps = (): AudioApp[] => {
  return NativeSoundScraper.listAudioApps()
}

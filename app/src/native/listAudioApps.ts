import NativeSoundScraper from './NativeSoundScraper'
import type { AudioApp } from './types'

export const listAudioApps = (): AudioApp[] => {
  return NativeSoundScraper.listAudioApps()
}

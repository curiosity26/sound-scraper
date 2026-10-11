import NativeSoundScraper from '@/bridge/NativeSoundScraper'

/** Version string reported by the Rust core through the native bridge. */
export const getCoreVersion = (): string => {
  return NativeSoundScraper.getVersion()
}

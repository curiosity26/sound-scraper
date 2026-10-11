import NativeSoundScraper from '@/bridge/NativeSoundScraper'

/** Native Save dialog for one file type; null if cancelled. */
export const pickSaveFile = (
  title: string,
  defaultName: string,
  extension: string,
): Promise<string | null> => {
  return NativeSoundScraper.pickSaveFile(title, defaultName, extension)
}

import NativeSoundScraper from './NativeSoundScraper'

/** Native Save dialog for one file type; null if cancelled. */
export function pickSaveFile(
  title: string,
  defaultName: string,
  extension: string,
): Promise<string | null> {
  return NativeSoundScraper.pickSaveFile(title, defaultName, extension)
}

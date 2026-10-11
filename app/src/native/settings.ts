import NativeSoundScraper from './NativeSoundScraper'
import type { Settings } from './types'

export const settings = {
  get: (): Settings & { effectiveRecordingsDir: string } =>
    JSON.parse(NativeSoundScraper.getSettings()),
  /** Saves settings (validated by the core) and re-points the library. */
  set: (value: Settings): Promise<void> =>
    NativeSoundScraper.setSettings(
      JSON.stringify({
        version: value.version,
        recordingsDir: value.recordingsDir,
        quality: value.quality,
        id3Version: value.id3Version,
        lastSource: value.lastSource,
        skin: value.skin ?? null,
        doubleSize: value.doubleSize ?? false,
        trimSilence: value.trimSilence ?? true,
        keepMasters: value.keepMasters ?? true,
        masterMinMinutes: value.masterMinMinutes ?? 20,
        masterBudgetGb: value.masterBudgetGb ?? 10,
        masterMaxAgeDays: value.masterMaxAgeDays ?? 30,
      }),
    ),
  pickFolder: (): Promise<string | null> => NativeSoundScraper.pickFolder(),
}

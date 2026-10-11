import { isRecord } from '@/utils/isRecord'
import { parseJson } from '@/utils/parseJson'

import NativeSoundScraper from './NativeSoundScraper'
import type { Settings, StoredSettings } from './types'

/** A shallow check of the settings JSON (the core validates the rest). */
const isStoredSettings = (value: unknown): value is StoredSettings =>
  isRecord(value) &&
  typeof value.effectiveRecordingsDir === 'string' &&
  typeof value.quality === 'string' &&
  typeof value.id3Version === 'string' &&
  (value.recordingsDir === null || typeof value.recordingsDir === 'string')

export const settings = {
  get: (): StoredSettings =>
    parseJson(NativeSoundScraper.getSettings(), isStoredSettings, 'settings'),
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

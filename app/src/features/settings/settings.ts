import type { Settings, StoredSettings } from '@/bridge/generated'
import NativeSoundScraper from '@/bridge/NativeSoundScraper'
import { parseNative } from '@/bridge/parseNative'

import { isStoredSettings } from './guards/isStoredSettings'

export const settings = {
  get: (): StoredSettings =>
    parseNative(NativeSoundScraper.getSettings(), isStoredSettings, 'settings'),
  /** Saves settings (validated by the core) and re-points the library. */
  set: (value: Settings): Promise<void> =>
    NativeSoundScraper.setSettings(
      JSON.stringify({
        version: value.version,
        recordingsDir: value.recordingsDir,
        quality: value.quality,
        id3Version: value.id3Version,
        lastSource: value.lastSource,
        skin: value.skin,
        doubleSize: value.doubleSize,
        trimSilence: value.trimSilence,
        keepMasters: value.keepMasters,
        masterMinMinutes: value.masterMinMinutes,
        masterBudgetGb: value.masterBudgetGb,
        masterMaxAgeDays: value.masterMaxAgeDays,
      } satisfies Settings),
    ),
  pickFolder: (): Promise<string | null> => NativeSoundScraper.pickFolder(),
}

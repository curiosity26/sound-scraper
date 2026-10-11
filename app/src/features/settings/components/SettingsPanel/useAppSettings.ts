import { useState } from 'react'

import type { Settings, StoredSettings } from '@/bridge/generated'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { settings } from '@/features/settings/settings'
import { errorText } from '@/shared/utils/errorText'

export type UseAppSettingsResult = {
  readonly current: StoredSettings
  /** Why the last save failed. */
  readonly error: string | undefined
  /** Saves a change on top of the settings on disk. */
  readonly save: (patch: Partial<Settings>) => Promise<void>
  /** Asks for a recordings folder and saves it. */
  readonly chooseFolder: () => Promise<void>
}

/**
 * The app settings; each change is saved right away by the Rust core. A new
 * recordings folder refreshes every library view.
 */
export const useAppSettings = (): UseAppSettingsResult => {
  const [current, setCurrent] = useState(() => settings.get())
  const [error, setError] = useState<string>()

  const save = async (patch: Partial<Settings>) => {
    // Fresh from disk: another window may have changed other settings.
    const next = { ...settings.get(), ...patch }
    setError(undefined)
    try {
      await settings.set(next)
      setCurrent(settings.get())
      if ('recordingsDir' in patch) {
        refreshLibraryViews()
      }
    } catch (e) {
      setError(errorText(e))
    }
  }

  const chooseFolder = async () => {
    const dir = await settings.pickFolder()
    if (dir) {
      await save({ recordingsDir: dir })
    }
  }

  return { current, error, save, chooseFolder }
}

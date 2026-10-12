import { useState } from 'react'

import type { Settings, StoredSettings } from '@/bridge/generated'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { settings } from '@/features/settings/settings'
import { errorText } from '@/shared/utils/errorText'

export type UseAppSettingsResult = {
  readonly current: StoredSettings
  /** Why the last save failed. */
  readonly error: string | undefined
  /** Saves a change on top of the settings on disk; a failure sets `error`. */
  readonly save: (patch: Partial<Settings>) => void
  /** Asks for a recordings folder and saves it; a failure sets `error`. */
  readonly chooseFolder: () => void
}

/**
 * The app settings; each change is saved right away by the Rust core. A new
 * recordings folder refreshes every library view.
 */
export const useAppSettings = (): UseAppSettingsResult => {
  const [current, setCurrent] = useState(() => settings.get())
  const [error, setError] = useState<string>()

  const write = async (patch: Partial<Settings>) => {
    // Fresh from disk: another window may have changed other settings.
    const next = { ...settings.get(), ...patch }
    await settings.set(next)
    setCurrent(settings.get())
    if ('recordingsDir' in patch) {
      refreshLibraryViews()
    }
  }

  const showError = (e: unknown) => {
    setError(errorText(e))
  }

  const save = (patch: Partial<Settings>) => {
    setError(undefined)
    write(patch).catch(showError)
  }

  const chooseFolder = () => {
    const pickAndWrite = async () => {
      const dir = await settings.pickFolder()
      if (dir) {
        setError(undefined)
        await write({ recordingsDir: dir })
      }
    }
    pickAndWrite().catch(showError)
  }

  return { current, error, save, chooseFolder }
}

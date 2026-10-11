import { useSyncExternalStore } from 'react'

import { settingsTab } from '@/features/settings/settingsTab'

export type SettingsTab = ReturnType<typeof settingsTab.get>

export type UseSettingsTabResult = {
  /** The tab showing (shared by every window, so a skin file can open it). */
  readonly tab: SettingsTab
}

/** The settings window's tab, re-rendering when it changes. */
export const useSettingsTab = (): UseSettingsTabResult => {
  const tab = useSyncExternalStore(settingsTab.subscribe, settingsTab.get)
  return { tab }
}

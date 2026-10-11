import { useContext } from 'react'

import {
  SettingsPanelContext,
  type SettingsPanelState,
} from './SettingsPanelContext'

/** The settings panel this section is part of (inside a SettingsPanel). */
export const useSettingsPanel = (): SettingsPanelState => {
  const panel = useContext(SettingsPanelContext)
  if (!panel) {
    throw new Error('useSettingsPanel outside a SettingsPanel')
  }
  return panel
}

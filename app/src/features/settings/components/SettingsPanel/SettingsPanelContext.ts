import { createContext } from 'react'

import type { UseAppSettingsResult } from './useAppSettings'

export type SettingsPanelState = UseAppSettingsResult & {
  readonly textStyle: object
}

/**
 * The settings this panel shows and saves, with its text style, shared by
 * its sections so each reads what it shows instead of taking it as props.
 */
export const SettingsPanelContext = createContext<SettingsPanelState | null>(
  null,
)

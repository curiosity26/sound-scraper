import { createContext } from 'react'

import type { PanelTheme } from './types'

/** Colors for the library and settings content (see usePanelStyles). */
export const PanelThemeContext = createContext<PanelTheme | undefined>(undefined)

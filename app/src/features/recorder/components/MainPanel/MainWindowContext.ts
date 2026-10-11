import { createContext } from 'react'

import type { UseMainWindowStateResult } from './useMainWindowState'

/** The main window's layout, shade and side panels (see useMainWindowState). */
export const MainWindowContext = createContext<UseMainWindowStateResult | null>(
  null,
)

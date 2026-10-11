import { useContext } from 'react'

import { MainWindowContext } from './MainWindowContext'
import type { UseMainWindowStateResult } from './useMainWindowState'

export type UseMainWindowResult = UseMainWindowStateResult

/** The main window this element is part of (inside a MainPanel). */
export const useMainWindow = (): UseMainWindowResult => {
  const win = useContext(MainWindowContext)
  if (!win) {
    throw new Error('useMainWindow outside a MainPanel')
  }
  return win
}

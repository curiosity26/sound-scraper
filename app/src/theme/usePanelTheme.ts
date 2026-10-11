import { useContext } from 'react'

import { PanelThemeContext } from './PanelThemeContext'

export const usePanelTheme = () => useContext(PanelThemeContext)

import { useContext } from 'react'

import { PanelThemeContext } from '@/theme/PanelThemeContext'

export const usePanelTheme = () => useContext(PanelThemeContext)

import { useContext } from 'react'

import { PanelThemeContext } from '@/shared/theme/PanelThemeContext'

export const usePanelTheme = () => useContext(PanelThemeContext)

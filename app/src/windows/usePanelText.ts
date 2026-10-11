import { useSkin } from '@/skin/useSkin'

import { isDarkColor } from './isDarkColor'

export type UsePanelTextResult = {
  readonly fg: { readonly color: string }
  readonly isDark: boolean
}

/** Text color and whether the panel is dark, from the skin's controls. */
export const usePanelText = (
  panel: 'library' | 'settings' | 'details' | 'editor' | 'burn',
): UsePanelTextResult => {
  const skin = useSkin()
  const c = skin.panels[panel].controls
  return {
    fg: { color: c.text ?? '#f2f2f2' },
    isDark: isDarkColor(c.background ?? '#1e1e1e'),
  }
}

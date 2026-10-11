import { useSkin } from '@/skin/useSkin'

import { isDarkColor } from './isDarkColor'

/** Text color and whether the panel is dark, from the skin's controls. */
export function usePanelText(
  panel: 'library' | 'settings' | 'details' | 'editor' | 'burn',
) {
  const skin = useSkin()
  const c = skin.panels[panel].controls
  return {
    fg: { color: c.text ?? '#f2f2f2' },
    isDark: isDarkColor(c.background ?? '#1e1e1e'),
  }
}

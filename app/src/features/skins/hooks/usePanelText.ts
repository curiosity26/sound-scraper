import { useSkin } from './useSkin'

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

const isDarkColor = (hex: string): boolean => {
  const h = hex.replace('#', '')
  const v = (i: number) =>
    parseInt(
      h.length < 6 ? h.charAt(i).repeat(2) : h.slice(i * 2, i * 2 + 2),
      16,
    )
  return 0.299 * v(0) + 0.587 * v(1) + 0.114 * v(2) < 128
}

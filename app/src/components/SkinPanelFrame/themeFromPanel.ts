import type { FramePanel } from '@/skin/types'
import type { PanelTheme } from '@/theme/types'

export const themeFromPanel = (panel: FramePanel): PanelTheme => {
  const c = panel.controls
  return {
    text: c.text,
    background: c.background,
    border: c.border,
    accent: c.accent,
    button: c.button,
    buttonText: c.buttonText,
    table: panel.table,
    scrollbar: panel.scrollbar,
    playlist: panel.playlist,
    progress: panel.progress,
  }
}

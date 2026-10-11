import type { ResolvedFramePanel } from '@/bridge/generated'
import type { PanelTheme } from '@/shared/theme/types'

export const themeFromPanel = (panel: ResolvedFramePanel): PanelTheme => {
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

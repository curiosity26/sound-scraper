// The track editor's colors, from the skin: its panel controls and its
// waveform colors (skin.json panels.editor.controls / .waveform).
import { useMemo } from 'react'

import { usePanelTheme } from '@/theme/usePanelTheme'

import type { EditorTheme } from './types'
import { withAlpha } from './withAlpha'

export const useEditorTheme = (
  waveform: Record<string, string>,
): EditorTheme => {
  const panel = usePanelTheme()
  return useMemo(() => {
    const wave = (name: string, fallback: string) => waveform[name] ?? fallback
    const text = panel?.text ?? '#f3ead0'
    const background = panel?.background ?? '#2a2421'
    return {
      background,
      raised: withAlpha(text, 0x1c),
      well: withAlpha('#000000', 0x40),
      text,
      dim: withAlpha(text, 0xa0),
      border: panel?.border ?? '#4a423c',
      accent: panel?.accent ?? '#9fd630',
      accentText: panel?.table.selectionText ?? '#10180a',
      lcd: wave('background', '#141210'),
      lcdText: wave('rms', '#b8f23e'),
      wave,
    }
  }, [panel, waveform])
}

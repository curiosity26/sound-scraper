// The track editor's colors, from the skin: its panel controls and its
// waveform colors (skin.json panels.editor.controls / .waveform).
import { useMemo } from 'react'

import { usePanelTheme } from '../panelTheme'

export type EditorTheme = {
  background: string
  /** Hovered and latched tools. */
  raised: string
  /** Inset fields (steppers). */
  well: string
  text: string
  dim: string
  border: string
  accent: string
  accentText: string
  lcd: string
  lcdText: string
  /** The waveform colors, by name. */
  wave: (name: string, fallback: string) => string
}

/** Colors for the tracks, in order (muted, like Logic's regions). */
export const TRACK_COLORS = [
  '#5b8def',
  '#e0a63b',
  '#58b368',
  '#c46fd8',
  '#e2685f',
  '#4cb7c2',
]

export function trackColor(i: number): string {
  return TRACK_COLORS[i % TRACK_COLORS.length]
}

/** `#rgb`/`#rrggbb` with an alpha byte (0..255). */
export function withAlpha(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split('')
      .map(x => x + x)
      .join('')
  }
  return `#${h.slice(0, 6)}${Math.round(alpha).toString(16).padStart(2, '0')}`
}

export function useEditorTheme(waveform: Record<string, string>): EditorTheme {
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

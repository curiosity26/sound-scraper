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

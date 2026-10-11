import type { FramePanel } from '@/skin/types'

export type PanelTheme = {
  text?: string
  background?: string
  border?: string
  accent?: string
  button?: string
  buttonText?: string
  table: Record<string, string | undefined>
  scrollbar: FramePanel['scrollbar']
  /** Playlist colors (library panel). */
  playlist?: Record<string, string | undefined>
  /** Burn progress colors (burn panel). */
  progress?: Record<string, string | undefined>
  /** Smaller text and tighter rows, for the small (1x) panels. */
  compact?: boolean
}

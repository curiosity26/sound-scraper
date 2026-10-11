// The colours of the library's in-panel dialogs (the playlist prompt and
// "+ Add Recordings…"): the skin's, or dark defaults.
import { usePanelTheme } from '@/shared/hooks/usePanelTheme'
import { colors } from '@/shared/theme/colors'

export type UseDialogColorsResult = {
  readonly background: string
  /** Text: a style. */
  readonly fg: { readonly color: string }
  /** Secondary text: a style. */
  readonly dim: { readonly color: string }
  readonly accent: string
  readonly border: string
}

export const useDialogColors = (): UseDialogColorsResult => {
  const theme = usePanelTheme()
  const text = theme?.text ?? '#f3ead0'
  return {
    background: theme?.background ?? '#2a2522',
    fg: { color: text },
    dim: { color: text + '99' },
    accent: theme?.accent ?? colors.accent,
    border: theme?.border ?? colors.border,
  }
}

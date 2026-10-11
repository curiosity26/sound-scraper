import { useMemo } from 'react'

import { usePanelTheme } from '@/shared/hooks/usePanelTheme'
import { colors } from '@/shared/theme/colors'

/** The burn panel's colors, from the skin's panel theme. */
export type UseBurnThemeResult = {
  readonly text: string
  readonly dim: string
  readonly border: string
  readonly accent: string
  readonly background: string
  readonly c: (name: string, fallback: string) => string
}

/** The burn panel's colors, from the skin (or the defaults). */
export const useBurnTheme = (): UseBurnThemeResult => {
  const t = usePanelTheme()
  return useMemo(() => {
    const p = t?.progress ?? {}
    return {
      text: t?.text ?? '#f3ead0',
      dim: (t?.text ?? '#f3ead0') + '99',
      border: t?.border ?? colors.border,
      accent: t?.accent ?? colors.accent,
      background: t?.background ?? '#2a2522',
      c: (name: string, fallback: string) => p[name] ?? fallback,
    }
  }, [t])
}

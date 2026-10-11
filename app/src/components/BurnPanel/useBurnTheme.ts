import { useMemo } from 'react'

import type { BurnTheme } from '@/burn/types'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { colors } from '@/theme/colors'

export type UseBurnThemeResult = BurnTheme

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

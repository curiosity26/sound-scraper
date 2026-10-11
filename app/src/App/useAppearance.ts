import { StyleSheet, useColorScheme } from 'react-native'

import { text } from '@/theme/text'

export type UseAppearanceResult = {
  readonly isDark: boolean
  /** Text color for the system appearance. */
  readonly textStyle: (typeof text)['light']
  /** Window background for the system appearance. */
  readonly background: (typeof backgrounds)['light']
}

const backgrounds = StyleSheet.create({
  light: { backgroundColor: '#ffffff' },
  dark: { backgroundColor: '#1e1e1e' },
})

/** The plain UI's colors, following light or dark mode. */
export const useAppearance = (): UseAppearanceResult => {
  const isDark = useColorScheme() === 'dark'
  return {
    isDark,
    textStyle: isDark ? text.dark : text.light,
    background: isDark ? backgrounds.dark : backgrounds.light,
  }
}

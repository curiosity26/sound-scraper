import { useColorScheme } from 'react-native'

import { text } from '@/theme/text'

export type UseTextStyleResult = {
  readonly isDark: boolean
  /** Text color for the system appearance. */
  readonly textStyle: (typeof text)['light']
}

/** The plain UI's text color, following light or dark mode. */
export const useTextStyle = (): UseTextStyleResult => {
  const isDark = useColorScheme() === 'dark'
  return { isDark, textStyle: isDark ? text.dark : text.light }
}

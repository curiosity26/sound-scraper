import { StyleSheet } from 'react-native'

import { colors } from '@/shared/theme/colors'

/** Styles several of the burn panel's parts share. */
export const commonStyles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  flex: { flex: 1 },
  heading: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12 },
  error: { color: colors.error },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
})

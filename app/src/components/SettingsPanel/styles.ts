import { StyleSheet } from 'react-native'

import { colors } from '@/theme/colors'

/** Styles shared by the settings panel and its sections. */
export const settingsStyles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 13 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 16 },
  choice: { paddingVertical: 4 },
  choiceLabel: { fontSize: 13 },
  choiceDetail: { fontSize: 11, opacity: 0.6, marginLeft: 18 },
  note: { fontSize: 11, opacity: 0.6, marginTop: 16 },
})

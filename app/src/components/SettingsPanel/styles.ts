import { StyleSheet } from 'react-native'

import { colors } from '@/theme/colors'

export const styles = StyleSheet.create({
  panel: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 13 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  path: { fontSize: 12, opacity: 0.8, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 16 },
  choice: { paddingVertical: 4 },
  choiceLabel: { fontSize: 13 },
  choiceDetail: { fontSize: 11, opacity: 0.6, marginLeft: 18 },
  note: { fontSize: 11, opacity: 0.6, marginTop: 16 },
  stepRow: { alignItems: 'center', gap: 10, paddingVertical: 2 },
  stepLabel: { fontSize: 13, width: 100 },
  stepValue: { fontSize: 13, minWidth: 80, textAlign: 'center' },
  dim: { opacity: 0.4 },
  error: { color: colors.error, fontSize: 12, marginTop: 8 },
})

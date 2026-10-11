import { StyleSheet } from 'react-native'

import { colors } from './colors'

export const styles = StyleSheet.create({
  content: { flex: 1, padding: 12 },
  message: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
  tabs: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  tab: { fontSize: 14, opacity: 0.6, paddingBottom: 4 },
  tabActive: {
    opacity: 1,
    fontWeight: '600',
    borderBottomWidth: 2,
  },
  skinError: {
    flex: 1,
    padding: 12,
    backgroundColor: '#2a2522',
    borderRadius: 6,
  },
  skinErrorText: { color: '#f3ead0', fontSize: 12 },
})

import { StyleSheet } from 'react-native'

import { colors } from '@/shared/theme/colors'

import { CARD_W } from './constants'

export const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: CARD_W,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffffff22',
    gap: 3,
  },
  chosen: { borderWidth: 2, padding: 5 },
  installCard: { width: undefined, marginBottom: 12, padding: 10, gap: 6 },
  title: { fontSize: 14, fontWeight: '600' },
  name: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 11, opacity: 0.75 },
  label: { fontSize: 13 },
  muted: { opacity: 0.5 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 2 },
  cardButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  buttonText: { fontSize: 13, fontWeight: '600', color: '#111' },
  plainButton: { paddingVertical: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    // Windows' text box clips its text without room for its own padding.
    minHeight: 28,
  },
  toggle: { paddingVertical: 4, marginTop: 10 },
  hint: { fontSize: 11, opacity: 0.6, marginTop: 8 },
  link: { color: colors.accent, fontSize: 13 },
  note: { fontSize: 12, marginTop: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
  warning: { fontSize: 11, opacity: 0.7, marginTop: 4 },
})

import { StyleSheet } from 'react-native'

/** Shared by the header and the rows, so their columns line up. */
export const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  check: { width: 20 },
  checkText: { fontSize: 14 },
  position: { width: 26, textAlign: 'right' },
  handle: {
    width: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
})

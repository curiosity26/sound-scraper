import { StyleSheet } from 'react-native'

/** The track list's row layout and columns, shared by its header and rows. */
export const listStyles = StyleSheet.create({
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  colNum: { width: 34 },
  colName: { flex: 1 },
  colTime: { width: 120, textAlign: 'right' },
})

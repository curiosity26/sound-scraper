import { StyleSheet } from 'react-native'

import { colors } from '@/theme/colors'

export const panelStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    padding: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
})

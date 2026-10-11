import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { capacityText } from '@/features/library/components/LibraryScreen/LibraryBody/CapacityBar/capacityText'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { usePanelTheme } from '@/shared/hooks/usePanelTheme'
import { colors } from '@/shared/theme/colors'

import { useHasBurner } from './useHasBurner'

/** Burn CD… (a CD writer is there) or Save CD Image… (none is), for the
 * playlist showing. */
export const BurnButton: FC = () => {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { hasBurner } = useHasBurner()
  const { onBurn } = useLibraryScreen()
  const { shown } = useLibraryView()
  const c = shown.capacity
  const disabled =
    c.fit === 'empty' || c.fit === 'tooMany' || c.fit === 'tooLong'
  return (
    <Pressable
      testID="burn-cd"
      disabled={disabled}
      accessibilityHint={disabled ? capacityText(c) : undefined}
      onPress={() => {
        const target = shown.burnTarget()
        if (target) {
          onBurn?.(target)
        }
      }}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.accent ?? colors.accent,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, styles.accentText, t.cell]}>
        {hasBurner ? 'Burn CD…' : 'Save CD Image…'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
})

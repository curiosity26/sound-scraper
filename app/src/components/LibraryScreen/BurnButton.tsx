import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import type { Capacity } from '@/playlists/types'
import { colors } from '@/theme/colors'

import { capacityText } from './capacityText'
import { useHasBurner } from './useHasBurner'

/** Burn CD… (a CD writer is there) or Save CD Image… (none is). */
export type BurnButtonProps = {
  readonly capacity: Capacity
  readonly onPress: () => void
}

export const BurnButton: FC<BurnButtonProps> = props => {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { hasBurner } = useHasBurner()
  const c = props.capacity
  const disabled =
    c.fit === 'empty' || c.fit === 'tooMany' || c.fit === 'tooLong'
  return (
    <Pressable
      testID="burn-cd"
      disabled={disabled}
      accessibilityHint={disabled ? capacityText(c) : undefined}
      onPress={props.onPress}
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

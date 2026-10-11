import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { burnApi } from '@/burn/burnApi'
import { colors } from '@/theme/colors'
import { usePanelStyles } from '@/theme/usePanelStyles'
import { usePanelTheme } from '@/theme/usePanelTheme'

import { capacityText } from './capacityText'
import type { Capacity } from './types'

/** Burn CD… (a CD writer is there) or Save CD Image… (none is). */
export function BurnButton(props: {
  capacity: Capacity
  onPress: () => void
}): React.JSX.Element {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const [hasBurner, setHasBurner] = useState(false)
  useEffect(() => {
    const check = () => {
      try {
        setHasBurner(burnApi.devices().devices.some(d => d.kind !== 'image'))
      } catch {
        setHasBurner(false)
      }
    }
    check()
    // Burners can be plugged in at any time.
    const timer = setInterval(check, 3000)
    return () => clearInterval(timer)
  }, [])
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

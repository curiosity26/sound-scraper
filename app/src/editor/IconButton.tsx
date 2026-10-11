/* eslint-disable react-native/no-inline-styles */

import React from 'react'
import { Pressable, StyleSheet } from 'react-native'

import { Icon, type IconName } from './Icon'
import type { EditorTheme } from './types'

/** A square button with an icon (transport). */
export function IconButton(props: {
  th: EditorTheme
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  size?: number
}): React.JSX.Element {
  const { th } = props
  const color = props.active ? th.accent : th.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: props.disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={props.icon} color={color} size={props.size ?? 12} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  iconButton: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
})

import React, { type FC } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import {
  Icon,
  type IconName,
} from '@/features/editor/components/EditorPanel/Icon'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

export type IconButtonProps = {
  readonly icon: IconName
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly active?: boolean
  readonly size?: number
}

/** A square button with an icon (transport). */
export const IconButton: FC<IconButtonProps> = props => {
  const { th } = useEditor()
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

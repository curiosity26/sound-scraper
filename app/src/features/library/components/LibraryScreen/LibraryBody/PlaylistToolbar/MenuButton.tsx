import React, { type FC, useRef } from 'react'
import { Pressable, StyleSheet, type View } from 'react-native'

import { usePanelTheme } from '@/shared/hooks/usePanelTheme'
import { colors } from '@/shared/theme/colors'

export type MenuButtonProps = {
  /** The pressable's testID (named so tests find the Pressable, not this). */
  readonly id: string
  readonly accessibilityLabel: string
  /** Opens a pop-up menu under `anchor` (the button). */
  readonly onPress: (anchor: View | null) => void
  readonly children: React.ReactNode
}

/** A bordered toolbar button that opens a native menu under itself. */
export const MenuButton: FC<MenuButtonProps> = props => {
  const theme = usePanelTheme()
  const button = useRef<View>(null)
  return (
    <Pressable
      ref={button}
      testID={props.id}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={() => {
        props.onPress(button.current)
      }}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {props.children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 4,
    gap: 6,
  },
})

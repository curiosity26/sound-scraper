import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useDialogColors } from '@/components/LibraryScreen/LibraryBody/useDialogColors'

export type SheetButtonProps = {
  /** The pressable's testID (named so tests find the Pressable, not this). */
  readonly id: string
  readonly label: string
  readonly onPress: () => void
  /** The default action, filled with the accent colour. */
  readonly accent?: boolean
  readonly disabled?: boolean
}

/** A button in the sheet's footer. */
export const SheetButton: FC<SheetButtonProps> = props => {
  const { fg, accent, border } = useDialogColors()
  return (
    <Pressable
      testID={props.id}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.button,
        props.accent
          ? { borderColor: border, backgroundColor: accent }
          : { borderColor: border },
        props.disabled === true && styles.disabled,
      ]}
    >
      <Text style={[styles.text, props.accent ? styles.accentText : fg]}>
        {props.label}
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
  text: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
  disabled: { opacity: 0.35 },
})

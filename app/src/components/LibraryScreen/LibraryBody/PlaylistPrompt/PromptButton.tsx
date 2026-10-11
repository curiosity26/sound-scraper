import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useDialogColors } from '@/components/LibraryScreen/LibraryBody/useDialogColors'

export type PromptButtonProps = {
  /** Also names its testID, `prompt-<label>`. */
  readonly label: string
  readonly onPress: () => void
  /** The default action, filled with the accent colour. */
  readonly accent?: boolean
}

/** One of the prompt's buttons. */
export const PromptButton: FC<PromptButtonProps> = props => {
  const { fg, accent, border } = useDialogColors()
  return (
    <Pressable
      testID={`prompt-${props.label}`}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: props.accent ? accent : 'transparent',
          borderColor: border,
          opacity: pressed ? 0.7 : 1,
        },
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
})

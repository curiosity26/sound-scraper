import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

export type RecordButtonProps = {
  readonly testID: string
  readonly label: string
  readonly onPress: () => void
  readonly color: string
  readonly disabled?: boolean
}

/** A colored Record / Pause / Stop button. */
export const RecordButton: FC<RecordButtonProps> = props => {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        { backgroundColor: props.color },
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
})

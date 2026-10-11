import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useBurnTheme } from './useBurnTheme'

export type ButtonProps = {
  readonly label: string
  readonly onPress: () => void
  readonly accent?: boolean
  readonly disabled?: boolean
  readonly testID?: string
}

export const Button: FC<ButtonProps> = props => {
  const th = useBurnTheme()
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: th.border,
          backgroundColor: props.accent ? th.accent : 'transparent',
          opacity: props.disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          props.accent ? styles.accentText : { color: th.text },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
})

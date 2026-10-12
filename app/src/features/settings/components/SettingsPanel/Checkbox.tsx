import type { FC } from 'react'
import { Pressable, Text } from 'react-native'

import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

export type CheckboxProps = {
  readonly checked: boolean
  readonly label: string
  readonly detail: string
  readonly onPress: () => void
}

/** A setting that's on or off, with a detail line. */
export const Checkbox: FC<CheckboxProps> = props => {
  const { textStyle } = useSettingsPanel()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={props.label}
      accessibilityHint={props.detail}
      accessibilityState={{ checked: props.checked }}
      onPress={props.onPress}
      style={settingsStyles.choice}
    >
      <Text style={[settingsStyles.choiceLabel, textStyle]}>
        {props.checked ? '☑ ' : '☐ '}
        {props.label}
      </Text>
      <Text style={[settingsStyles.choiceDetail, textStyle]}>
        {props.detail}
      </Text>
    </Pressable>
  )
}

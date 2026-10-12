import type { FC } from 'react'
import { Pressable, Text } from 'react-native'

import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

export type ChoiceProps = {
  readonly selected: boolean
  readonly label: string
  readonly detail: string
  readonly onPress: () => void
}

/** A radio choice with a detail line. */
export const Choice: FC<ChoiceProps> = props => {
  const { textStyle } = useSettingsPanel()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityHint={props.detail}
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      style={settingsStyles.choice}
    >
      <Text style={[settingsStyles.choiceLabel, textStyle]}>
        {props.selected ? '● ' : '○ '}
        {props.label}
      </Text>
      <Text style={[settingsStyles.choiceDetail, textStyle]}>
        {props.detail}
      </Text>
    </Pressable>
  )
}

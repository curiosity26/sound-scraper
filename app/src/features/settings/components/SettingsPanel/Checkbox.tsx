import type { FC } from 'react'
import { Pressable, Text } from 'react-native'

import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

export type CheckboxProps = {
  readonly checked: boolean
  readonly label: string
  readonly detail: string
  readonly onPress: () => void
  /** The check box's testID. Not a `testID` prop here, so a test finds the
   * pressable itself rather than this wrapper. */
  readonly testName: string
}

/** A setting that's on or off, with a detail line. */
export const Checkbox: FC<CheckboxProps> = props => {
  const { textStyle } = useSettingsPanel()
  return (
    <Pressable
      onPress={props.onPress}
      style={settingsStyles.choice}
      testID={props.testName}
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

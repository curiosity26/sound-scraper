import type { FC } from 'react'
import { Pressable, Text } from 'react-native'

import { settingsStyles } from './styles'

export type ChoiceProps = {
  readonly selected: boolean
  readonly label: string
  readonly detail: string
  readonly onPress: () => void
  readonly textStyle: object
}

/** A radio choice with a detail line. */
export const Choice: FC<ChoiceProps> = props => {
  return (
    <Pressable onPress={props.onPress} style={settingsStyles.choice}>
      <Text style={[settingsStyles.choiceLabel, props.textStyle]}>
        {props.selected ? '● ' : '○ '}
        {props.label}
      </Text>
      <Text style={[settingsStyles.choiceDetail, props.textStyle]}>
        {props.detail}
      </Text>
    </Pressable>
  )
}

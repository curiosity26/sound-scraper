import type { FC } from 'react'
import { Pressable, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'

import { styles } from './styles'

export type StepRowProps = {
  readonly label: string
  readonly value: string
  readonly onStep: (dir: 1 | -1) => void
  readonly disabled: boolean
  readonly textStyle: object
}

/** A label, and its value between − and + buttons. */
export const StepRow: FC<StepRowProps> = props => {
  const { label, value, onStep, disabled, textStyle } = props
  const t = usePanelStyles()
  return (
    <View style={[styles.row, styles.stepRow]}>
      <Text style={[styles.stepLabel, textStyle]}>{label}</Text>
      <Pressable
        onPress={() => {
          onStep(-1)
        }}
        disabled={disabled}
      >
        <Text style={[styles.link, t.link, disabled && styles.dim]}>−</Text>
      </Pressable>
      <Text style={[styles.stepValue, textStyle, disabled && styles.dim]}>
        {value}
      </Text>
      <Pressable
        onPress={() => {
          onStep(1)
        }}
        disabled={disabled}
      >
        <Text style={[styles.link, t.link, disabled && styles.dim]}>+</Text>
      </Pressable>
    </View>
  )
}

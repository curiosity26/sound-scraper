import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { MONO } from './constants'
import type { EditorTheme } from './types'

export type StepperProps = {
  readonly th: EditorTheme
  readonly label: string
  readonly value: string
  readonly onStep: (dir: 1 | -1) => void
}

/** A label and a value with ‹ › steppers. */
export const Stepper: FC<StepperProps> = props => {
  const { th } = props
  const arrow = (dir: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label} ${dir > 0 ? 'up' : 'down'}`}
      onPress={() => {
        props.onStep(dir)
      }}
      style={({ pressed }) => [
        styles.stepArrow,
        { opacity: pressed ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.stepArrowText, { color: th.accent }]}>
        {dir > 0 ? '›' : '‹'}
      </Text>
    </Pressable>
  )
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepLabel, { color: th.dim }]}>{props.label}</Text>
      <View
        style={[
          styles.stepBox,
          { borderColor: th.border, backgroundColor: th.well },
        ]}
      >
        {arrow(-1)}
        <Text style={[styles.stepValue, { color: th.text }]}>
          {props.value}
        </Text>
        {arrow(1)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepLabel: { fontSize: 11 },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    height: 22,
  },
  stepArrow: { width: 18, alignItems: 'center' },
  stepArrowText: { fontSize: 15, lineHeight: 18 },
  stepValue: {
    fontSize: 11,
    minWidth: 46,
    textAlign: 'center',
    fontFamily: MONO,
  },
})

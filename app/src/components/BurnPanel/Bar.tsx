import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

export type BarProps = {
  readonly value: number
  readonly color: string
  readonly track: string
  readonly label: string
  readonly text: string
}

export const Bar: FC<BarProps> = props => {
  const pct = `${Math.max(0, Math.min(1, props.value)) * 100}%` as const
  return (
    <View style={[styles.bar, { backgroundColor: props.track }]}>
      <View
        style={[styles.barFill, { width: pct, backgroundColor: props.color }]}
      />
      <Text style={[styles.barText, { color: props.text }]}>{props.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 14,
    borderRadius: 2,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barText: { fontSize: 10, textAlign: 'center' },
})

import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import type { BurnTheme } from '@/burn/types'

export type LabelProps = {
  readonly th: BurnTheme
  readonly text: string
}

export const Label: FC<LabelProps> = props => {
  return (
    <Text style={[styles.label, { color: props.th.dim }]}>{props.text}</Text>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
})

import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useBurnTheme } from '@/windows/BurnApp/BurnPanel/useBurnTheme'

export type LabelProps = {
  readonly text: string
}

export const Label: FC<LabelProps> = props => {
  const th = useBurnTheme()
  return <Text style={[styles.label, { color: th.dim }]}>{props.text}</Text>
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
})

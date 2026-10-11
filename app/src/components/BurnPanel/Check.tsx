import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import type { BurnTheme } from '@/burn/types'

import { commonStyles } from './commonStyles'

export type CheckProps = {
  readonly th: BurnTheme
  readonly label: string
  readonly value: boolean
  readonly onChange: (v: boolean) => void
}

export const Check: FC<CheckProps> = props => {
  return (
    <Pressable
      style={styles.check}
      onPress={() => {
        props.onChange(!props.value)
      }}
    >
      <Text style={[styles.checkBox, { color: props.th.text }]}>
        {props.value ? '☑' : '☐'}
      </Text>
      <Text style={[commonStyles.small, { color: props.th.text }]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { fontSize: 14 },
})

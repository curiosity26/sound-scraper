import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

export type CheckProps = {
  readonly label: string
  readonly value: boolean
  readonly onChange: (v: boolean) => void
}

export const Check: FC<CheckProps> = props => {
  const th = useBurnTheme()
  return (
    <Pressable
      style={styles.check}
      onPress={() => {
        props.onChange(!props.value)
      }}
    >
      <Text style={[styles.checkBox, { color: th.text }]}>
        {props.value ? '☑' : '☐'}
      </Text>
      <Text style={[commonStyles.small, { color: th.text }]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { fontSize: 14 },
})

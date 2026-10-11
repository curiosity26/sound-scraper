import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

export type ChoiceProps<T extends string> = {
  readonly label: string
  readonly value: T
  readonly options: ReadonlyArray<readonly [T, string]>
  readonly onChange: (v: T) => void
}

export const Choice = <T extends string>(props: ChoiceProps<T>): ReactNode => {
  const th = useBurnTheme()
  return (
    <View style={styles.choiceRow}>
      <Text style={[styles.choiceLabel, { color: th.dim }]}>{props.label}</Text>
      <View style={styles.pills}>
        {props.options.map(([value, text]) => {
          const on = value === props.value
          return (
            <Pressable
              key={value}
              onPress={() => {
                props.onChange(value)
              }}
              style={[
                styles.pill,
                { borderColor: on ? th.accent : th.border },
                on && { backgroundColor: th.accent + '33' },
              ]}
            >
              <Text style={[styles.pillText, { color: th.text }]}>{text}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceLabel: { width: 56, fontSize: 12 },
  pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: { fontSize: 12 },
})

import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

export type SourceRowProps = {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
  readonly disabled: boolean
  readonly textStyle: object
}

/** One capture source, with a radio mark. */
export const SourceRow: FC<SourceRowProps> = props => {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.row, props.selected && styles.rowSelected]}
    >
      <Text style={[styles.rowText, props.textStyle]}>
        {props.selected ? '● ' : '○ '}
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6, paddingHorizontal: 10 },
  rowSelected: { backgroundColor: '#2f6fde22' },
  rowText: { fontSize: 14 },
})

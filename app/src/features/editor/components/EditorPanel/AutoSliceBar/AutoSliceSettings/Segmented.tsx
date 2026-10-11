/* eslint-disable react-native/no-inline-styles */

import React, { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

export type SegmentedProps<T extends string> = {
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly value: T | null
  readonly onChange: (value: T) => void
}

/** Joined buttons, one selected. */
export const Segmented = <T extends string>(
  props: SegmentedProps<T>,
): ReactNode => {
  const { th } = useEditor()
  return (
    <View style={[styles.segmented, { borderColor: th.border }]}>
      {props.options.map((o, i) => {
        const on = o.value === props.value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              props.onChange(o.value)
            }}
            style={[
              styles.segment,
              i > 0 && { borderLeftWidth: 1, borderLeftColor: th.border },
              on && { backgroundColor: th.accent },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: on ? th.accentText : th.text },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  segment: { paddingHorizontal: 9, height: 22, justifyContent: 'center' },
  segmentText: { fontSize: 11 },
})

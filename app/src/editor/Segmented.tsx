/* eslint-disable react-native/no-inline-styles */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { EditorTheme } from './types'

/** Joined buttons, one selected. */
export const Segmented = <T extends string>(props: {
  th: EditorTheme
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
}): React.JSX.Element => {
  const { th } = props
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

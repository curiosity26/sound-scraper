import React, { type FC } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { TextField } from '@/components/TextField'

import type { EditorTheme } from './types'

export type NameFieldProps = {
  readonly th: EditorTheme
  readonly left: number
  readonly top: number
  readonly value: string
  readonly onChange: (text: string) => void
  /** Close it, keeping the text (or not, for Esc). */
  readonly onDone: (keep?: boolean) => void
}

/** The name field over a new (or double-clicked) track. */
export const NameField: FC<NameFieldProps> = props => {
  const { th } = props
  return (
    <View style={[styles.nameField, { left: props.left, top: props.top }]}>
      <TextField
        testID="editor-slice-name"
        autoFocus
        selectTextOnFocus
        value={props.value}
        onChangeText={props.onChange}
        onSubmitEditing={() => {
          props.onDone()
        }}
        onBlur={() => {
          props.onDone()
        }}
        onKeyPress={e => {
          if (e.nativeEvent.key === 'Escape') {
            props.onDone(false)
          }
        }}
        style={[
          styles.nameFieldInput,
          {
            color: th.text,
            backgroundColor: th.background,
            borderColor: th.accent,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  nameField: { position: 'absolute', width: 200 },
  nameFieldInput: {
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    fontSize: 12,
    paddingTop: Platform.OS === 'windows' ? 2 : 0,
    paddingBottom: 0,
    paddingHorizontal: 5,
    textAlignVertical: 'center',
  },
})

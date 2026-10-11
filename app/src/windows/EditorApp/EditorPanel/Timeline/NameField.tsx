import React, { type FC } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { TextField } from '@/components/TextField'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { RULER } from './constants'

/**
 * The name field over a new (or double-clicked) track, while one is being
 * named. Enter or leaving keeps the text; Esc doesn't.
 */
export const NameField: FC = () => {
  const { th, naming, tracks, view } = useEditor()
  const namingTrack =
    naming.naming === null
      ? undefined
      : tracks.rows.find(r => r.owner === naming.naming)
  if (!namingTrack) {
    return null
  }
  const left = Math.min(
    Math.max(0, namingTrack.startMs / view.scale - view.scrollX + 2),
    Math.max(0, view.viewWidth - 200),
  )
  return (
    <View style={[styles.nameField, { left, top: RULER + 1 }]}>
      <TextField
        testID="editor-slice-name"
        autoFocus
        selectTextOnFocus
        value={naming.nameDraft}
        onChangeText={naming.setNameDraft}
        onSubmitEditing={() => {
          naming.finishNaming()
        }}
        onBlur={() => {
          naming.finishNaming()
        }}
        onKeyPress={e => {
          if (e.nativeEvent.key === 'Escape') {
            naming.finishNaming(false)
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

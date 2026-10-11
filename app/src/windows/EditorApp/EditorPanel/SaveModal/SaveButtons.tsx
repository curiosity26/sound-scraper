import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { modalStyles } from './styles'

/** Cancel, delete or keep the original; "Saving…" while it saves. */
export const SaveButtons: FC = () => {
  const { th, saveFlow } = useEditor()
  if (saveFlow.state.kind === 'saving') {
    return (
      <Text style={[modalStyles.modalBody, { color: th.dim }]}>Saving…</Text>
    )
  }
  const choose = (keepOriginal: boolean) => {
    void saveFlow.save(keepOriginal)
  }
  return (
    <View style={styles.modalButtons}>
      <ToolButton label="Cancel" onPress={saveFlow.cancel} />
      <ToolButton
        label="No, delete it"
        onPress={() => {
          choose(false)
        }}
      />
      <ToolButton
        label="Yes, keep it"
        onPress={() => {
          choose(true)
        }}
        accent
      />
    </View>
  )
}

const styles = StyleSheet.create({
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
})

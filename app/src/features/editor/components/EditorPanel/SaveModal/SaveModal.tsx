import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { SaveButtons } from './SaveButtons'
import { SaveSummary } from './SaveSummary'
import { modalStyles } from './styles'

/** Save: the in-window question whether to keep the original. */
export const SaveModal: FC = () => {
  const { th, saveFlow } = useEditor()
  const { state } = saveFlow
  if (!saveFlow.isOpen) {
    return null
  }
  const error = state.kind === 'failed' ? state.error : undefined
  return (
    <View style={styles.modalBackdrop} testID="editor-save-modal">
      <View
        style={[
          styles.modal,
          { backgroundColor: th.background, borderColor: th.border },
        ]}
      >
        <Text style={[styles.modalTitle, { color: th.text }]}>
          Keep the original recording?
        </Text>
        <SaveSummary />
        {error && (
          <Text style={[modalStyles.modalBody, styles.error]}>
            Couldn't save: {error}
          </Text>
        )}
        <SaveButtons />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { width: 380, padding: 18, borderRadius: 10, borderWidth: 1, gap: 10 },
  modalTitle: { fontSize: 14, fontWeight: '600' },
  error: { color: '#ff6b5a' },
})

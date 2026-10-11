import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ToolButton } from './ToolButton'
import { useEditor } from './useEditor'

/** Save: the in-window question whether to keep the original. */
export const SaveModal: FC = () => {
  const { th, target, saveFlow, tracks, core } = useEditor()
  const { state } = saveFlow
  if (!saveFlow.isOpen) {
    return null
  }
  const count = tracks.tracks.length
  const { reencoded } = tracks
  const error = state.kind === 'failed' ? state.error : undefined
  const choose = (keepOriginal: boolean) => {
    void saveFlow.save(keepOriginal)
  }
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
        <Text style={[styles.modalBody, { color: th.text }]}>
          Saving creates {count === 1 ? '1 track' : `${count} tracks`} from “
          {target.title}”.
          {reencoded > 0
            ? ` ${
                reencoded === 1 ? 'One is' : `${reencoded} are`
              } re-encoded because a stretch inside was deleted.`
            : ''}
          {core.hasMaster
            ? ' Each is encoded once from the lossless master, cut exactly.'
            : ''}
        </Text>
        {error && (
          <Text style={[styles.modalBody, styles.error]}>
            Couldn't save: {error}
          </Text>
        )}
        {state.kind === 'saving' ? (
          <Text style={[styles.modalBody, { color: th.dim }]}>Saving…</Text>
        ) : (
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
        )}
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
  modalBody: { fontSize: 12, lineHeight: 17 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  error: { color: '#ff6b5a' },
})

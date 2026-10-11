import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ToolButton } from './ToolButton'
import type { EditorTheme } from './types'

export type SaveModalProps = {
  readonly th: EditorTheme
  readonly title: string
  readonly count: number
  readonly reencoded: number
  readonly fromMaster: boolean
  readonly saving: boolean
  readonly error?: string
  readonly onCancel: () => void
  readonly onChoose: (keepOriginal: boolean) => void
}

/** Save: the in-window question whether to keep the original. */
export const SaveModal: FC<SaveModalProps> = props => {
  const { th } = props
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
          Saving creates{' '}
          {props.count === 1 ? '1 track' : `${props.count} tracks`} from “
          {props.title}”.
          {props.reencoded > 0
            ? ` ${
                props.reencoded === 1 ? 'One is' : `${props.reencoded} are`
              } re-encoded because a stretch inside was deleted.`
            : ''}
          {props.fromMaster
            ? ' Each is encoded once from the lossless master, cut exactly.'
            : ''}
        </Text>
        {props.error && (
          <Text style={[styles.modalBody, styles.error]}>
            Couldn't save: {props.error}
          </Text>
        )}
        {props.saving ? (
          <Text style={[styles.modalBody, { color: th.dim }]}>Saving…</Text>
        ) : (
          <View style={styles.modalButtons}>
            <ToolButton th={th} label="Cancel" onPress={props.onCancel} />
            <ToolButton
              th={th}
              label="No, delete it"
              onPress={() => {
                props.onChoose(false)
              }}
            />
            <ToolButton
              th={th}
              label="Yes, keep it"
              onPress={() => {
                props.onChoose(true)
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

import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useDialogColors } from '@/components/LibraryScreen/LibraryBody/useDialogColors'

export type PromptDialogProps = {
  readonly title: string
  /** A sentence under the title. */
  readonly message?: string
  /** A field under the title. */
  readonly field?: React.ReactNode
  /** The buttons, right-aligned. */
  readonly children: React.ReactNode
}

/** The prompt's box over the dimmed panel. */
export const PromptDialog: FC<PromptDialogProps> = props => {
  const { background, fg, border } = useDialogColors()
  return (
    <View style={styles.backdrop} testID="playlist-prompt">
      <View
        style={[
          styles.modal,
          { backgroundColor: background, borderColor: border },
        ]}
      >
        <Text style={[styles.title, fg]}>{props.title}</Text>
        {props.field}
        {props.message !== undefined && (
          <Text style={[styles.body, fg]}>{props.message}</Text>
        )}
        <View style={styles.buttons}>{props.children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    width: 320,
    maxWidth: '92%',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  title: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 17 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
})

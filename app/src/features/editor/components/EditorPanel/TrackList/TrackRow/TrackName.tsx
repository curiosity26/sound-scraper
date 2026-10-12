import React, { type FC, useEffect, useState } from 'react'
import { Platform, StyleSheet } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { TextField } from '@/shared/components/TextField'

export type TrackNameProps = {
  /** Its accessible name: which track's name it is. */
  readonly label: string
  readonly value: string
  readonly onCommit: (name: string) => void
}

/** A track's name, edited in place (Enter or leaving saves, Esc cancels). */
export const TrackName: FC<TrackNameProps> = props => {
  const { th } = useEditor()
  const [text, setText] = useState(props.value)
  useEffect(() => {
    setText(props.value)
  }, [props.value])
  const commit = () => {
    const name = text.trim()
    if (name && name !== props.value) {
      props.onCommit(name)
    } else {
      setText(props.value)
    }
  }
  return (
    <TextField
      accessibilityLabel={props.label}
      style={[styles.name, { color: th.text }]}
      value={text}
      onChangeText={setText}
      onSubmitEditing={commit}
      onBlur={commit}
      onKeyPress={e => {
        if (e.nativeEvent.key === 'Escape') {
          setText(props.value)
        }
      }}
    />
  )
}

const styles = StyleSheet.create({
  // The track list's name column. Explicit heights and no vertical
  // padding: Windows' text box otherwise adds its own and clips the text in
  // these short rows.
  name: {
    flex: 1,
    height: 20,
    paddingTop: Platform.OS === 'windows' ? 2 : 0,
    paddingBottom: 0,
    paddingHorizontal: 2,
    fontSize: 12,
    textAlignVertical: 'center',
  },
})

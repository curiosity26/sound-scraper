import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

export type TagsButtonProps = {
  /** 0-based; shown 1-based. */
  readonly index: number
}

/** ⚙: opens the tag form on the track (or the selection it's part of). */
export const TagsButton: FC<TagsButtonProps> = props => {
  const { th, commands } = useEditor()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit tags of track ${String(props.index + 1)}`}
      hitSlop={4}
      onPress={() => {
        commands.editTrackTags(props.index)
      }}
      style={styles.button}
    >
      <Text style={[styles.gear, { color: th.dim }]}>⚙</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 2 },
  gear: { fontSize: 13 },
})

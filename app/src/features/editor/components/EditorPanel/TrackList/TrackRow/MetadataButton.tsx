import React, { type FC } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import { Icon } from '@/features/editor/components/EditorPanel/Icon'
import { trackLabel } from '@/features/editor/components/EditorPanel/trackLabel'
import type { TrackRow } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

export type MetadataButtonProps = {
  readonly track: TrackRow
  /** Its place in the track list. */
  readonly index: number
}

/** A pencil: opens the tag form on the track (or the selection it's part of). */
export const MetadataButton: FC<MetadataButtonProps> = props => {
  const { th, commands } = useEditor()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit metadata of ${trackLabel(
        props.track,
      ).toLowerCase()}`}
      hitSlop={4}
      onPress={() => {
        commands.editTrackTags(props.index)
      }}
      style={styles.button}
    >
      <Icon name="edit" color={th.dim} size={12} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 2 },
})

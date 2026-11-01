import React, { type FC } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'
import { coverUri } from '@/features/tags/components/DetailsPane/CoverArt/coverUri'

/** The thumbnail's width and height. */
const SIZE = 22

export type TrackCoverProps = {
  /** The track's cover (its own, or the recording's), or null for none. */
  readonly path: string | null
  /** Which track's cover it is. */
  readonly label: string
}

/** A small cover thumbnail, or an empty square when the track has none. */
export const TrackCover: FC<TrackCoverProps> = props => {
  const { th } = useEditor()
  if (!props.path) {
    return <View style={[styles.cover, { borderColor: th.border }]} />
  }
  return (
    <Image
      accessible
      accessibilityRole="image"
      accessibilityLabel={props.label}
      source={{ uri: coverUri(props.path) }}
      style={[styles.cover, { borderColor: th.border }]}
      resizeMode="cover"
    />
  )
}

const styles = StyleSheet.create({
  cover: {
    width: SIZE,
    height: SIZE,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
})

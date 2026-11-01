import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { listStyles } from '@/features/editor/components/EditorPanel/TrackList/styles'
import type { TrackRow } from '@/features/editor/components/EditorPanel/types'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { TrackCover } from './TrackCover'
import { TrackName } from './TrackName'

export type TrackTitleProps = {
  readonly track: TrackRow
  /** 0-based; shown 1-based. */
  readonly index: number
}

/** The track's cover, its name (edited in place) and its artist under it. */
export const TrackTitle: FC<TrackTitleProps> = props => {
  const { track: tr, index: i } = props
  const { th, naming, trackTags } = useEditor()
  const tags = trackTags.effective[i]
  const { owner } = tr
  const number = String(i + 1)
  return (
    <View style={[listStyles.colName, styles.title]}>
      <TrackCover
        path={tags?.coverPath ?? null}
        label={`Track ${number} cover`}
      />
      <View style={styles.text}>
        {owner === null ? (
          <Text style={[styles.name, { color: th.text }]}>{tr.name}</Text>
        ) : (
          <TrackName
            label={`Track ${number} name`}
            value={tr.name}
            onCommit={name => {
              naming.rename(owner, name)
            }}
          />
        )}
        {tags?.artist ? (
          <Text
            numberOfLines={1}
            accessibilityLabel={`Track ${number} artist: ${tags.artist}`}
            style={[styles.artist, { color: th.dim }]}
          >
            {tags.artist}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { flex: 1 },
  name: { fontSize: 12 },
  artist: { fontSize: 10, paddingHorizontal: 2 },
})

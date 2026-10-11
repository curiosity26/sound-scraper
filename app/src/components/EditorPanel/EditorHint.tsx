import React, { type FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import type { EditorTheme } from './types'

export type EditorHintProps = {
  readonly th: EditorTheme
  /** A lossless master exists: every cut is exact. */
  readonly hasMaster: boolean
  /** How many tracks saving re-encodes. */
  readonly reencoded: number
}

/** The line under the track list: how cuts land, and how to edit. */
export const EditorHint: FC<EditorHintProps> = props => {
  const { reencoded } = props
  return (
    <Text style={[styles.hint, { color: props.th.dim }]} numberOfLines={2}>
      {props.hasMaster ? 'Lossless master: every cut is exact.  ' : ''}
      {reencoded > 0
        ? `${
            reencoded === 1 ? 'One track has' : `${reencoded} tracks have`
          } a deleted stretch inside, so saving re-encodes ${
            reencoded === 1 ? 'it' : 'them'
          }.  `
        : ''}
      Click the ruler to move the playhead, drag it to scrub · ✂ Slice (M) at
      the playhead · drag a slice’s edge to move it · double-click a track to
      rename it · Space plays, P previews a slice
    </Text>
  )
}

const styles = StyleSheet.create({
  hint: { fontSize: 10, marginTop: 5 },
})

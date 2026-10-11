import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { usePanelStyles } from '@/hooks/usePanelStyles'

import { PlaylistActionsButton } from './PlaylistActionsButton'
import { PlaylistPicker } from './PlaylistPicker'

/** The table's leading toolbar with native menus: the playlist picker, ⋯,
 * and "+ Add Recordings…" while a playlist shows. */
export type PlaylistToolbarProps = {
  /** "+ Add Recordings…" was pressed. */
  readonly onAddRecordings: () => void
}

export const PlaylistToolbar: FC<PlaylistToolbarProps> = props => {
  const t = usePanelStyles()
  const { showing } = useLibraryView().shown
  return (
    <>
      <PlaylistPicker />
      <PlaylistActionsButton />
      {showing && (
        <Pressable
          testID="playlist-add-recordings"
          onPress={props.onAddRecordings}
        >
          <Text style={[styles.link, t.link, t.cell]}>+ Add Recordings…</Text>
        </Pressable>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  link: { fontSize: 13 },
})

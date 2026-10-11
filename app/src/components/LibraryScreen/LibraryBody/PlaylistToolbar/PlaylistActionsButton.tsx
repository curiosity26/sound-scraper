import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { usePlaylistControls } from '@/components/LibraryScreen/LibraryBody/usePlaylistControls'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'

import { MenuButton } from './MenuButton'

/** ⋯: rename, duplicate, export or delete the playlist showing. */
export const PlaylistActionsButton: FC = () => {
  const t = usePanelStyles()
  const { textStyle } = useLibraryScreen()
  const controls = usePlaylistControls()
  if (!controls.active) {
    return null
  }
  return (
    <MenuButton
      id="playlist-actions"
      accessibilityLabel="Playlist actions"
      onPress={controls.openActions}
    >
      <Text style={[styles.text, textStyle, t.text, t.cell]}>⋯</Text>
    </MenuButton>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
})

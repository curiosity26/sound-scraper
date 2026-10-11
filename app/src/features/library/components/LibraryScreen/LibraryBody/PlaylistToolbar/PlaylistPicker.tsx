import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { usePlaylistControls } from '@/features/library/components/LibraryScreen/LibraryBody/usePlaylistControls'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

import { MenuButton } from './MenuButton'

/** The picker button: "▾ Library" or "▾ Road Trip". */
export const PlaylistPicker: FC = () => {
  const t = usePanelStyles()
  const { textStyle } = useLibraryScreen()
  const controls = usePlaylistControls()
  return (
    <MenuButton
      id="playlist-picker"
      accessibilityLabel="Choose the library or a playlist"
      onPress={controls.openPicker}
    >
      <Text style={[styles.name, textStyle, t.text, t.cell]} numberOfLines={1}>
        {controls.active?.name ?? 'Library'}
      </Text>
      <Text style={[styles.arrow, textStyle, t.text]}>▾</Text>
    </MenuButton>
  )
}

const styles = StyleSheet.create({
  name: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  arrow: { fontSize: 11 },
})

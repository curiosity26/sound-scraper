import React, { type FC, useRef } from 'react'
import { Pressable, StyleSheet, Text, type View } from 'react-native'

import { usePlaylistControls } from '@/components/LibraryScreen/LibraryBody/usePlaylistControls'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { colors } from '@/theme/colors'

/** ⋯: rename, duplicate, export or delete the playlist showing. */
export const PlaylistActionsButton: FC = () => {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { textStyle } = useLibraryScreen()
  const controls = usePlaylistControls()
  const button = useRef<View>(null)
  if (!controls.active) {
    return null
  }
  return (
    <Pressable
      ref={button}
      testID="playlist-actions"
      accessibilityRole="button"
      accessibilityLabel="Playlist actions"
      onPress={() => {
        controls.openActions(button.current)
      }}
      style={({ pressed }) => [
        styles.picker,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.pickerText, textStyle, t.text, t.cell]}>⋯</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 4,
    gap: 6,
  },
  pickerText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
})

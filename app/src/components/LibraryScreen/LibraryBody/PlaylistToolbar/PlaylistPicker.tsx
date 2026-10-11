import React, { type FC, useRef } from 'react'
import { Pressable, StyleSheet, Text, type View } from 'react-native'

import { usePlaylistControls } from '@/components/LibraryScreen/LibraryBody/usePlaylistControls'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { colors } from '@/theme/colors'

/** The picker button: "▾ Library" or "▾ Road Trip". */
export const PlaylistPicker: FC = () => {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { textStyle } = useLibraryScreen()
  const controls = usePlaylistControls()
  const button = useRef<View>(null)
  return (
    <Pressable
      ref={button}
      testID="playlist-picker"
      accessibilityRole="button"
      accessibilityLabel="Choose the library or a playlist"
      onPress={() => {
        controls.openPicker(button.current)
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
      <Text
        style={[styles.pickerText, textStyle, t.text, t.cell]}
        numberOfLines={1}
      >
        {controls.active?.name ?? 'Library'}
      </Text>
      <Text style={[styles.pickerArrow, textStyle, t.text]}>▾</Text>
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
  pickerArrow: { fontSize: 11 },
})

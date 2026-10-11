import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors } from '@/theme/colors'
import { usePanelStyles } from '@/theme/usePanelStyles'
import { usePanelTheme } from '@/theme/usePanelTheme'

import type { UsePlaylistControlsResult } from './usePlaylistControls'

/** The picker button: "▾ Library" or "▾ Road Trip". */
export function PlaylistPicker(props: {
  controls: UsePlaylistControlsResult
  textStyle: object
}): React.JSX.Element {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { controls } = props
  return (
    <Pressable
      ref={controls.picker}
      testID="playlist-picker"
      accessibilityRole="button"
      accessibilityLabel="Choose the library or a playlist"
      onPress={controls.openPicker}
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
        style={[styles.pickerText, props.textStyle, t.text, t.cell]}
        numberOfLines={1}
      >
        {controls.active?.name ?? 'Library'}
      </Text>
      <Text style={[styles.pickerArrow, props.textStyle, t.text]}>▾</Text>
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

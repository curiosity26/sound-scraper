import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors } from '@/theme/colors'
import { usePanelStyles } from '@/theme/usePanelStyles'
import { usePanelTheme } from '@/theme/usePanelTheme'

import type { UsePlaylistControlsResult } from './usePlaylistControls'

/** ⋯: rename, duplicate, export or delete the playlist showing. */
export type PlaylistActionsButtonProps = {
  readonly controls: UsePlaylistControlsResult
  readonly textStyle: object
}

export const PlaylistActionsButton: FC<PlaylistActionsButtonProps> = props => {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { controls } = props
  if (!controls.active) {
    return null
  }
  return (
    <Pressable
      ref={controls.actionsButton}
      testID="playlist-actions"
      accessibilityRole="button"
      accessibilityLabel="Playlist actions"
      onPress={controls.openActions}
      style={({ pressed }) => [
        styles.picker,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.pickerText, props.textStyle, t.text, t.cell]}>
        ⋯
      </Text>
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

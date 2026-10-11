import React, { type FC, useRef } from 'react'
import { Pressable, StyleSheet, Text, type View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { colors } from '@/theme/colors'

import { useLibraryView } from './useLibraryView'
import { usePlaylistControls } from './usePlaylistControls'

/** "Add to ▾", for checked rows. */
export const AddToButton: FC = () => {
  const t = usePanelStyles()
  const { checkedNames } = useLibraryView().checks
  const controls = usePlaylistControls()
  const button = useRef<View>(null)
  if (checkedNames.length === 0) {
    return null
  }
  return (
    <Pressable
      ref={button}
      testID="playlist-add-to"
      onPress={() => {
        controls.openAddTo(checkedNames, button.current)
      }}
    >
      <Text style={[styles.link, t.link, t.cell]}>Add to ▾</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 13 },
})

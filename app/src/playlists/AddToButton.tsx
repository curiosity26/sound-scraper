import React, { type FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors } from '@/theme/colors'
import { usePanelStyles } from '@/theme/usePanelStyles'

import type { UsePlaylistControlsResult } from './usePlaylistControls'

/** "Add to ▾", for checked rows. */
export type AddToButtonProps = {
  readonly controls: UsePlaylistControlsResult
  readonly fileNames: readonly string[]
}

export const AddToButton: FC<AddToButtonProps> = props => {
  const t = usePanelStyles()
  if (props.fileNames.length === 0) {
    return null
  }
  return (
    <Pressable
      ref={props.controls.addTo}
      testID="playlist-add-to"
      onPress={() => {
        props.controls.openAddTo(props.fileNames)
      }}
    >
      <Text style={[styles.link, t.link, t.cell]}>Add to ▾</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 13 },
})

import React, { type FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { ToolButton } from '@/features/editor/components/EditorPanel/ToolButton'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

/** How many slices it found, Cancel, and Add Slices. */
export const AutoSliceActions: FC = () => {
  const { th, autoSlice } = useEditor()
  const found = autoSlice.proposals.length
  return (
    <>
      <Text style={[styles.autoFound, { color: th.dim }]}>
        {found === 0
          ? 'No gaps found'
          : `${found + 1} tracks · ${found} ${
              found === 1 ? 'slice' : 'slices'
            }`}
      </Text>
      <ToolButton label="Cancel" onPress={autoSlice.cancel} />
      <ToolButton
        label="Add Slices"
        onPress={autoSlice.apply}
        disabled={found === 0}
        accent
      />
    </>
  )
}

const styles = StyleSheet.create({
  autoFound: { fontSize: 11 },
})

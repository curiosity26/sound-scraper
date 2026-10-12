import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { AutoSliceActions } from './AutoSliceActions'
import { AutoSliceSettings } from './AutoSliceSettings'

/**
 * Auto Slice's settings, while it's open, in a bar above the waveform so
 * the proposed slices (dashed) stay in view while the settings change.
 */
export const AutoSliceBar: FC = () => {
  const { th, autoSlice } = useEditor()
  if (!autoSlice.options) {
    return null
  }
  return (
    <View
      style={[
        styles.autoBar,
        { backgroundColor: th.raised, borderColor: th.border },
      ]}
    >
      <Text style={[styles.autoTitle, { color: th.text }]}>Auto Slice</Text>
      <AutoSliceSettings options={autoSlice.options} />
      <View style={styles.flex} />
      <AutoSliceActions />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  autoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  autoTitle: { fontSize: 12, fontWeight: '600' },
})

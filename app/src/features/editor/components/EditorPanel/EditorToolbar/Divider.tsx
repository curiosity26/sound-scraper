import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

/** A thin vertical line between groups. */
export const Divider: FC = () => {
  const { th } = useEditor()
  return <View style={[styles.divider, { backgroundColor: th.border }]} />
}

const styles = StyleSheet.create({
  divider: { width: 1, height: 18, marginHorizontal: 4 },
})

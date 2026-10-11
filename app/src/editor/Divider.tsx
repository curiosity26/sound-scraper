import React from 'react'
import { StyleSheet, View } from 'react-native'

import type { EditorTheme } from './types'

/** A thin vertical line between groups. */
export const Divider = (props: { th: EditorTheme }): React.JSX.Element => {
  return <View style={[styles.divider, { backgroundColor: props.th.border }]} />
}

const styles = StyleSheet.create({
  divider: { width: 1, height: 18, marginHorizontal: 4 },
})

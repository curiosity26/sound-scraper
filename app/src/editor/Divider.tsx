import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import type { EditorTheme } from './types'

export type DividerProps = { readonly th: EditorTheme }

/** A thin vertical line between groups. */
export const Divider: FC<DividerProps> = props => {
  return <View style={[styles.divider, { backgroundColor: props.th.border }]} />
}

const styles = StyleSheet.create({
  divider: { width: 1, height: 18, marginHorizontal: 4 },
})

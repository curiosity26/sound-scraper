import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { MONO } from './constants'
import type { EditorTheme } from './types'

export type LcdProps = {
  readonly th: EditorTheme
  readonly main: string
  readonly sub: string
}

/** The position readout: a small LCD. */
export const Lcd: FC<LcdProps> = props => {
  const { th } = props
  return (
    <View
      style={[styles.lcd, { backgroundColor: th.lcd, borderColor: th.border }]}
    >
      <Text style={[styles.lcdMain, { color: th.lcdText }]}>{props.main}</Text>
      <Text style={[styles.lcdSub, { color: th.lcdText }]}>{props.sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  lcd: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 112,
  },
  lcdMain: { fontSize: 15, fontFamily: MONO, letterSpacing: 0.5 },
  lcdSub: { fontSize: 9, fontFamily: MONO, opacity: 0.65, marginTop: -1 },
})

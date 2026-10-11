import { type FC, useRef } from 'react'
import { Platform, ScrollView, StyleSheet, Text } from 'react-native'

import type { BurnTheme } from '@/burn/types'

export type BurnLogProps = {
  readonly th: BurnTheme
  readonly lines: readonly string[]
}

/** The burn's log, kept scrolled to the newest line. */
export const BurnLog: FC<BurnLogProps> = props => {
  const { th, lines } = props
  const log = useRef<ScrollView>(null)
  return (
    <ScrollView
      ref={log}
      onContentSizeChange={() => {
        log.current?.scrollToEnd({ animated: false })
      }}
      style={[
        styles.log,
        { backgroundColor: th.c('log', '#0006'), borderColor: th.border },
      ]}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          selectable
          style={[styles.logLine, { color: th.c('logText', th.text) }]}
        >
          {line}
        </Text>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  log: { flex: 2, borderWidth: 1, borderRadius: 4, padding: 6, minHeight: 60 },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.OS === 'windows' ? 'Consolas' : 'Menlo',
    lineHeight: 15,
  },
})

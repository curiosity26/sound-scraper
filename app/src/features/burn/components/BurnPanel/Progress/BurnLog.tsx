import { type FC, useRef } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'

import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'
import { platformText } from '@/shared/platformText'

import { useBurnProgress } from './useBurnProgress'

/** The burn's log, kept scrolled to the newest line. */
export const BurnLog: FC = () => {
  const th = useBurnTheme()
  const { logLines: lines } = useBurnProgress()
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
    fontFamily: platformText.monoFont,
    lineHeight: 15,
  },
})

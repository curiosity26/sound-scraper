import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { SECTORS_74, SECTORS_80 } from '@/playlists/constants'
import type { Capacity } from '@/playlists/types'
import { colors } from '@/theme/colors'

import { capacitySummary } from './capacitySummary'
import { capacityText } from './capacityText'

/** The CD capacity bar with 74 and 80 minute marks, and what it means. */
export type CapacityBarProps = {
  readonly capacity: Capacity
  readonly textStyle: object
  /** Beside the summary (Burn CD…). */
  readonly action?: React.ReactNode
}

export const CapacityBar: FC<CapacityBarProps> = props => {
  const theme = usePanelTheme()
  const t = usePanelStyles()
  const pc = theme?.playlist ?? {}
  const c = props.capacity
  // The scale runs a little past 80 minutes so "too long" shows.
  const scale = SECTORS_80 * 1.1
  const fill =
    c.fit === 'fits74'
      ? pc.fill ?? theme?.accent ?? colors.accent
      : c.fit === 'fits80'
      ? pc.fill80 ?? '#e0a030'
      : pc.over ?? colors.error
  const text = pc.text ?? theme?.text
  const pct = (sectors: number): `${number}%` =>
    `${Math.min(100, (sectors / scale) * 100)}%`
  return (
    <View style={styles.capacity} testID="cd-capacity">
      <View style={styles.capacityTop}>
        <Text
          style={[
            styles.capacityLine,
            styles.capacitySummary,
            props.textStyle,
            { color: text },
            t.cell,
          ]}
        >
          {capacitySummary(c)}
        </Text>
        {props.action}
      </View>
      <View
        style={[styles.bar, { backgroundColor: pc.track ?? '#0004' }]}
        accessibilityLabel={capacityText(c)}
      >
        <View
          style={[
            styles.barFill,
            {
              width: pct(c.totalSectors),
              backgroundColor: fill,
            },
          ]}
        />
        {[SECTORS_74, SECTORS_80].map(mark => (
          <View
            key={mark}
            style={[
              styles.mark,
              {
                left: pct(mark),
                backgroundColor: pc.mark ?? text ?? '#fff',
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.marks}>
        <Text
          style={[styles.markLabel, { color: text, left: pct(SECTORS_74) }]}
        >
          74
        </Text>
        <Text
          style={[styles.markLabel, { color: text, left: pct(SECTORS_80) }]}
        >
          80
        </Text>
      </View>
      <Text
        style={[
          styles.capacityLine,
          props.textStyle,
          { color: c.fit === 'tooLong' || c.fit === 'tooMany' ? fill : text },
          t.cell,
        ]}
      >
        {capacityText(c)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  capacity: { marginTop: 6, gap: 3 },
  capacityLine: { fontSize: 12 },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacitySummary: { flex: 1 },
  bar: { height: 8, borderRadius: 2, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  marks: { height: 11 },
  markLabel: { position: 'absolute', fontSize: 9, marginLeft: -6, top: -2 },
})

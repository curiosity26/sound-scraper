import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { capacityText } from '@/features/library/components/LibraryScreen/LibraryBody/CapacityBar/capacityText'
import { useCapacityColors } from '@/features/library/components/LibraryScreen/LibraryBody/CapacityBar/useCapacityColors'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { SECTORS_74, SECTORS_80 } from '@/features/playlists/constants'

// The scale runs a little past 80 minutes so "too long" shows.
const SCALE = SECTORS_80 * 1.1

const MARKS = [
  { sectors: SECTORS_74, label: '74' },
  { sectors: SECTORS_80, label: '80' },
] as const

const pct = (sectors: number): `${number}%` =>
  `${Math.min(100, (sectors / SCALE) * 100)}%`

/** The bar, filled to the playlist's length, with the 74 and 80 minute
 * marks and their labels under it. */
export const CapacityMeter: FC = () => {
  const c = useLibraryView().shown.capacity
  const { fill, text, track, mark } = useCapacityColors()
  return (
    <>
      <View
        style={[styles.bar, { backgroundColor: track }]}
        accessibilityLabel={capacityText(c)}
      >
        <View
          style={[
            styles.barFill,
            { width: pct(c.totalSectors), backgroundColor: fill },
          ]}
        />
        {MARKS.map(m => (
          <View
            key={m.sectors}
            style={[
              styles.mark,
              { left: pct(m.sectors), backgroundColor: mark },
            ]}
          />
        ))}
      </View>
      <View style={styles.marks}>
        {MARKS.map(m => (
          <Text
            key={m.sectors}
            style={[styles.markLabel, { color: text, left: pct(m.sectors) }]}
          >
            {m.label}
          </Text>
        ))}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  bar: { height: 8, borderRadius: 2, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  marks: { height: 11 },
  markLabel: { position: 'absolute', fontSize: 9, marginLeft: -6, top: -2 },
})

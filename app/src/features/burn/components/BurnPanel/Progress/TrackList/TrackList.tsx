import type { FC } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { useBurnProgress } from '@/features/burn/components/BurnPanel/Progress/useBurnProgress'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

import { TrackRow } from './TrackRow'

/** The tracks, each with its lamp, length and progress. */
export const TrackList: FC = () => {
  const th = useBurnTheme()
  const tracks = useBurnProgress().status?.tracks ?? []
  return (
    <View style={[styles.tracks, { borderColor: th.border }]}>
      <ScrollView>
        {tracks.map((t, i) => (
          <TrackRow key={i} track={t} index={i} />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  tracks: { flex: 3, borderWidth: 1, borderRadius: 4, minHeight: 80 },
})

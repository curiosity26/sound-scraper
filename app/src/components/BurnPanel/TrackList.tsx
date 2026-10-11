import type { FC } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import type { BurnStatus, BurnTheme } from '@/burn/types'

import { Bar } from './Bar'
import { commonStyles } from './commonStyles'
import { TRACK_WORDS } from './constants'
import { formatClock } from './formatClock'
import { Lamp } from './Lamp'

export type TrackListProps = {
  readonly th: BurnTheme
  readonly tracks: BurnStatus['tracks']
}

/** The tracks, each with its lamp, length and progress. */
export const TrackList: FC<TrackListProps> = props => {
  const { th, tracks } = props
  const fg = { color: th.text }
  const bar = th.c('bar', th.accent)
  const track = th.c('track', '#0004')
  return (
    <View style={[styles.tracks, { borderColor: th.border }]}>
      <ScrollView>
        {tracks.map((t, i) => (
          <View
            key={i}
            testID={`burn-track-${i + 1}`}
            style={[styles.trackRow, { borderColor: th.border }]}
          >
            <Lamp th={th} state={t.state} />
            <Text style={[styles.trackNo, { color: th.dim }]}>{i + 1}</Text>
            <Text style={[styles.trackTitle, fg]} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={[styles.trackLen, { color: th.dim }]}>
              {formatClock(t.durationMs)}
            </Text>
            <View style={styles.trackStatus}>
              {t.state === 'writing' || t.state === 'preparing' ? (
                <Bar
                  value={t.progress}
                  color={
                    t.state === 'preparing' ? th.c('preparing', '#a08a6a') : bar
                  }
                  track={track}
                  label={`${Math.floor(t.progress * 100)}%`}
                  text={th.text}
                />
              ) : (
                <Text style={[commonStyles.small, { color: th.dim }]}>
                  {TRACK_WORDS[t.state]}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  tracks: { flex: 3, borderWidth: 1, borderRadius: 4, minHeight: 80 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackNo: { width: 18, fontSize: 12, textAlign: 'right' },
  trackTitle: { flex: 1, fontSize: 12 },
  trackLen: { width: 44, fontSize: 12, textAlign: 'right' },
  trackStatus: { width: 120 },
})

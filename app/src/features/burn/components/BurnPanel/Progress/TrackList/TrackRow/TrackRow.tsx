import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { BurnStatus } from '@/bridge/generated'
import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { Bar } from '@/features/burn/components/BurnPanel/Progress/Bar'
import { formatClock } from '@/features/burn/components/BurnPanel/Progress/formatClock'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

import { TRACK_WORDS } from './constants'
import { Lamp } from './Lamp'

export type TrackRowProps = {
  readonly track: BurnStatus['tracks'][number]
  /** 0-based; shown 1-based. */
  readonly index: number
}

/** One track: its lamp, number, title, length and progress or state. */
export const TrackRow: FC<TrackRowProps> = props => {
  const { track: t, index: i } = props
  const th = useBurnTheme()
  return (
    <View
      testID={`burn-track-${i + 1}`}
      style={[styles.trackRow, { borderColor: th.border }]}
    >
      <Lamp state={t.state} />
      <Text style={[styles.trackNo, { color: th.dim }]}>{i + 1}</Text>
      <Text style={[styles.trackTitle, { color: th.text }]} numberOfLines={1}>
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
              t.state === 'preparing'
                ? th.c('preparing', '#a08a6a')
                : th.c('bar', th.accent)
            }
            track={th.c('track', '#0004')}
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
  )
}

const styles = StyleSheet.create({
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

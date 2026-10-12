import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatClock } from '@/features/burn/components/BurnPanel/Progress/formatClock'
import { formatPercent } from '@/features/burn/components/BurnPanel/Progress/formatPercent'
import { useBurnProgress } from '@/features/burn/components/BurnPanel/Progress/useBurnProgress'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'
import { colors } from '@/shared/theme/colors'

import { Meter } from './Meter'

/** What's happening, the total bar with the time, and the buffer bar. */
export const Summary: FC = () => {
  const th = useBurnTheme()
  const { status, running, headline } = useBurnProgress()
  return (
    <View style={styles.summary}>
      <Text style={[styles.headline, { color: th.text }]} numberOfLines={2}>
        {headline}
      </Text>
      <Meter
        label="Total"
        value={status?.overall ?? 0}
        color={
          status?.state === 'failed'
            ? th.c('failed', colors.error)
            : th.c('bar', th.accent)
        }
        valueText={formatPercent(status?.overall ?? 0)}
        clock={
          formatClock(status?.elapsedMs ?? 0) +
          (running && status?.remainingMs != null
            ? ` / ~${formatClock(status.elapsedMs + status.remainingMs)}`
            : '')
        }
      />
      {status?.buffer != null && (
        <Meter
          label="Buffer"
          value={running ? status.buffer : 0}
          color={th.c('buffer', '#6fa0d8')}
          valueText={running ? formatPercent(status.buffer, Math.round) : ''}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  summary: { gap: 5 },
  headline: { fontSize: 13, fontWeight: '600' },
})

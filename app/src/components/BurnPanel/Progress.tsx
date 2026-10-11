import { type FC, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import type { BurnJob, BurnTheme } from '@/burn/types'
import { colors } from '@/theme/colors'

import { Bar } from './Bar'
import { BurnLog } from './BurnLog'
import { Button } from './Button'
import { commonStyles } from './commonStyles'
import { formatClock } from './formatClock'
import { Modal } from './Modal'
import { TrackList } from './TrackList'
import { useBurnProgress } from './useBurnProgress'

export type ProgressProps = {
  readonly th: BurnTheme
  /** The job shown: burnJob's value. */
  readonly current: BurnJob
}

const REVEAL = Platform.OS === 'windows' ? 'Show in Explorer' : 'Show in Finder'

/** The burn going track by track: the bars, the log, and its buttons. */
export const Progress: FC<ProgressProps> = props => {
  const { th, current } = props
  const {
    status,
    error,
    running,
    image,
    output,
    headline,
    logLines,
    close,
    again,
    saveLog,
    cancel,
    reveal,
  } = useBurnProgress(current)
  // Asking before stopping a CD-R part way.
  const [confirm, setConfirm] = useState(false)
  const stop = () => {
    setConfirm(false)
    cancel()
  }

  const fg = { color: th.text }
  const bar = th.c('bar', th.accent)
  const track = th.c('track', '#0004')

  return (
    <View style={commonStyles.root}>
      <TrackList th={th} tracks={status?.tracks ?? []} />

      <View style={styles.summary}>
        <Text
          style={[styles.headline, fg]}
          numberOfLines={2}
          testID="burn-headline"
        >
          {headline}
        </Text>
        <View style={styles.meterRow}>
          <Text style={[styles.meterLabel, { color: th.dim }]}>Total</Text>
          <View style={commonStyles.flex}>
            <Bar
              value={status?.overall ?? 0}
              color={
                status?.state === 'failed' ? th.c('failed', colors.error) : bar
              }
              track={track}
              label={`${Math.floor((status?.overall ?? 0) * 100)}%`}
              text={th.text}
            />
          </View>
          <Text style={[styles.clock, { color: th.dim }]}>
            {formatClock(status?.elapsedMs ?? 0)}
            {running && status?.remainingMs != null
              ? ` / ~${formatClock(status.elapsedMs + status.remainingMs)}`
              : ''}
          </Text>
        </View>
        {status?.buffer != null && (
          <View style={styles.meterRow}>
            <Text style={[styles.meterLabel, { color: th.dim }]}>Buffer</Text>
            <View style={commonStyles.flex}>
              <Bar
                value={running ? status.buffer : 0}
                color={th.c('buffer', '#6fa0d8')}
                track={track}
                label={running ? `${Math.round(status.buffer * 100)}%` : ''}
                text={th.text}
              />
            </View>
            <View style={styles.clockSpace} />
          </View>
        )}
      </View>

      <BurnLog th={th} lines={logLines} />

      {(error || status?.message) && (
        <Text selectable style={[commonStyles.small, commonStyles.error]}>
          {error ?? status?.message}
        </Text>
      )}
      <View style={commonStyles.buttons}>
        {running ? (
          <Button
            th={th}
            label="Cancel"
            onPress={() => {
              if (image || status?.state === 'preparing') {
                stop()
              } else {
                setConfirm(true)
              }
            }}
            testID="burn-cancel"
          />
        ) : (
          <>
            {output ? <Button th={th} label={REVEAL} onPress={reveal} /> : null}
            {status?.state === 'done' && !image && (
              <Button th={th} label="Burn Another Copy" onPress={again} />
            )}
            {(status?.state === 'failed' || status?.state === 'cancelled') && (
              <Button th={th} label="Try Again" onPress={again} />
            )}
            <Button th={th} label="Save Log…" onPress={saveLog} />
            <Button
              th={th}
              label="Close"
              accent
              onPress={close}
              testID="burn-close"
            />
          </>
        )}
      </View>
      {confirm && (
        <Modal
          th={th}
          title="Stop burning?"
          body="A CD-R stopped part way can't be used again."
          action="Stop"
          onCancel={() => {
            setConfirm(false)
          }}
          onConfirm={stop}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  summary: { gap: 5 },
  headline: { fontSize: 13, fontWeight: '600' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterLabel: { width: 46, fontSize: 11 },
  clock: { width: 96, fontSize: 11, textAlign: 'right' },
  clockSpace: { width: 96 },
})

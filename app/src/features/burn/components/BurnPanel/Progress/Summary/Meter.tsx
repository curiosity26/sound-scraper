import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { Bar } from '@/features/burn/components/BurnPanel/Progress/Bar'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

export type MeterProps = {
  /** The row's name, left of the bar. */
  readonly label: string
  /** 0..1 */
  readonly value: number
  readonly color: string
  /** Drawn on the bar. */
  readonly valueText: string
  /** Right of the bar; an empty space of the same width when absent. */
  readonly clock?: string
}

/** One of the summary's rows: a label, a bar and a clock. */
export const Meter: FC<MeterProps> = props => {
  const th = useBurnTheme()
  return (
    <View style={styles.meterRow}>
      <Text style={[styles.meterLabel, { color: th.dim }]}>{props.label}</Text>
      <View style={commonStyles.flex}>
        <Bar
          value={props.value}
          color={props.color}
          track={th.c('track', '#0004')}
          label={props.valueText}
          text={th.text}
        />
      </View>
      {props.clock === undefined ? (
        <View style={styles.clockSpace} />
      ) : (
        <Text style={[styles.clock, { color: th.dim }]}>{props.clock}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterLabel: { width: 46, fontSize: 11 },
  clock: { width: 96, fontSize: 11, textAlign: 'right' },
  clockSpace: { width: 96 },
})

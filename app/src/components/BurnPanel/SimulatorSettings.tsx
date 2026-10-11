import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { BurnTheme, SimSettings } from '@/burn/types'

import { Check } from './Check'
import { Choice } from './Choice'
import { commonStyles } from './commonStyles'

export type SimulatorSettingsProps = {
  readonly th: BurnTheme
  readonly sim: SimSettings
  /** Tracks to burn: a fault goes on track 2, or 1 if that's all there is. */
  readonly tracks: number
  readonly onChange: (change: Partial<SimSettings>) => void
}

/** The simulated drive's disc, trouble and speed (test builds only). */
export const SimulatorSettings: FC<SimulatorSettingsProps> = props => {
  const { th, sim, tracks, onChange } = props
  return (
    <View style={[styles.simBox, { borderColor: th.border }]}>
      <Text style={[commonStyles.small, { color: th.dim }]}>
        Simulator (test builds only)
      </Text>
      <Choice
        th={th}
        label="Disc"
        value={sim.media}
        options={[
          ['blank74', 'Blank 74'],
          ['blank80', 'Blank 80'],
          ['rewritableUsed', 'Used CD-RW'],
          ['none', 'No disc'],
          ['dvd', 'DVD'],
        ]}
        onChange={media => {
          onChange({ media })
        }}
      />
      <Choice
        th={th}
        label="Trouble"
        value={sim.fault.kind}
        options={[
          ['none', 'None'],
          ['underrun', 'Underrun'],
          ['removed', 'Disc pulled'],
          ['writeError', 'Write error'],
        ]}
        onChange={kind => {
          onChange({
            fault:
              kind === 'none'
                ? { kind: 'none' }
                : { kind, track: Math.min(2, tracks || 1) },
          })
        }}
      />
      <Check
        th={th}
        label="Fast (8× quicker than a real drive)"
        value={sim.fast}
        onChange={fast => {
          onChange({ fast })
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  simBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 6,
    gap: 6,
  },
})

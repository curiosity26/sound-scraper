import { type FC, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { settingsStyles } from '@/components/SettingsPanel/styles'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import type { Settings } from '@/native/types'
import { stepIn as step } from '@/utils/stepIn'

import { AGES_DAYS, BUDGETS_GB, MIN_MINUTES } from './constants'
import { StepRow } from './StepRow'
import { useMastersUsage } from './useMastersUsage'

export type MastersProps = {
  readonly current: Settings
  readonly save: (patch: Partial<Settings>) => Promise<void>
  readonly textStyle: object
}

/**
 * Lossless masters (docs/track-editor-design.md §6.1): kept for long
 * recordings so the track editor's cuts are sample-exact, within a size
 * budget and an age limit.
 */
export const Masters: FC<MastersProps> = props => {
  const { current, save, textStyle } = props
  const t = usePanelStyles()
  const { usage, deleteAll } = useMastersUsage()
  const [confirming, setConfirming] = useState(false)
  const keep = current.keepMasters !== false
  const minutes = current.masterMinMinutes ?? 20
  const budget = current.masterBudgetGb ?? 10
  const age = current.masterMaxAgeDays ?? 30
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Lossless masters</Text>
      <Pressable
        onPress={() => {
          void save({ keepMasters: !keep })
        }}
        style={settingsStyles.choice}
        testID="keep-masters"
      >
        <Text style={[settingsStyles.choiceLabel, textStyle]}>
          {keep ? '☑ ' : '☐ '}
          Keep a lossless copy of long recordings
        </Text>
        <Text style={[settingsStyles.choiceDetail, textStyle]}>
          So the track editor cuts them exactly, without re-encoding the MP3.
          About 400 MB per hour, kept out of your recordings folder · default
        </Text>
      </Pressable>
      <StepRow
        label="Longer than"
        value={minutes ? `${minutes} min` : 'any length'}
        onStep={dir => {
          void save({ masterMinMinutes: step(MIN_MINUTES, minutes, dir) })
        }}
        disabled={!keep}
        textStyle={textStyle}
      />
      <StepRow
        label="Use at most"
        value={`${budget} GB`}
        onStep={dir => {
          void save({ masterBudgetGb: step(BUDGETS_GB, budget, dir) })
        }}
        disabled={!keep}
        textStyle={textStyle}
      />
      <StepRow
        label="Keep for"
        value={`${age} days`}
        onStep={dir => {
          void save({ masterMaxAgeDays: step(AGES_DAYS, age, dir) })
        }}
        disabled={!keep}
        textStyle={textStyle}
      />
      <Text style={[settingsStyles.note, textStyle]}>
        {usage.count === 0
          ? 'No masters are kept right now.'
          : `${usage.count} ${
              usage.count === 1 ? 'master' : 'masters'
            }, ${formatBytes(
              usage.bytes,
            )}. The oldest go first when space runs out; a master goes with its recording.`}
      </Text>
      {usage.count > 0 &&
        (confirming ? (
          <View style={settingsStyles.row}>
            <Text style={[settingsStyles.note, textStyle]}>
              Delete every master? Recordings stay.
            </Text>
            <Pressable
              onPress={() => {
                setConfirming(false)
                deleteAll()
              }}
            >
              <Text style={[settingsStyles.link, t.link]}>Delete</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirming(false)
              }}
            >
              <Text style={[settingsStyles.link, t.link]}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setConfirming(true)
            }}
          >
            <Text style={[settingsStyles.link, t.link]}>
              Delete all masters…
            </Text>
          </Pressable>
        ))}
    </>
  )
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

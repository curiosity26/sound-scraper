import type { FC } from 'react'
import { Text } from 'react-native'

import { Checkbox } from '@/features/settings/components/SettingsPanel/Checkbox'
import { settingsStyles } from '@/features/settings/components/SettingsPanel/styles'
import { useSettingsPanel } from '@/features/settings/components/SettingsPanel/useSettingsPanel'

import { MasterLimits } from './MasterLimits'
import { MastersStorage } from './MastersStorage'

/**
 * Lossless masters (docs/track-editor-design.md §6.1): kept for long
 * recordings so the track editor's cuts are sample-exact, within a size
 * budget and an age limit.
 */
export const Masters: FC = () => {
  const { current, save, textStyle } = useSettingsPanel()
  const keep = current.keepMasters
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Lossless masters</Text>
      <Checkbox
        checked={keep}
        label="Keep a lossless copy of long recordings"
        detail="So the track editor cuts them exactly, without re-encoding the MP3. About 400 MB per hour, kept out of your recordings folder · default"
        onPress={() => {
          save({ keepMasters: !keep })
        }}
        testName="keep-masters"
      />
      <MasterLimits />
      <MastersStorage />
    </>
  )
}

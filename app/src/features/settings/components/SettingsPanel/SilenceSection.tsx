import type { FC } from 'react'
import { Text } from 'react-native'

import { Checkbox } from './Checkbox'
import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/** Whether recordings are trimmed of silence at both ends. */
export const SilenceSection: FC = () => {
  const { current, save, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Silence</Text>
      <Checkbox
        checked={current.trimSilence}
        label="Trim silence"
        detail="Cuts the quiet before the first and after the last sound of a recording · default"
        onPress={() => {
          save({ trimSilence: !current.trimSilence })
        }}
        testName="trim-silence"
      />
    </>
  )
}

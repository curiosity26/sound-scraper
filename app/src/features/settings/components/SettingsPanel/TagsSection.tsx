import type { FC } from 'react'
import { Text } from 'react-native'

import { Choice } from './Choice'
import { ID3_VERSIONS } from './constants'
import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/** The ID3 version tags are written in. */
export const TagsSection: FC = () => {
  const { current, save, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Tags</Text>
      {ID3_VERSIONS.map(v => (
        <Choice
          key={v.value}
          selected={current.id3Version === v.value}
          label={v.label}
          detail={v.detail}
          onPress={() => {
            void save({ id3Version: v.value })
          }}
        />
      ))}
    </>
  )
}

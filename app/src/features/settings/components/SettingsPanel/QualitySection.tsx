import type { FC } from 'react'
import { Text } from 'react-native'

import { Choice } from './Choice'
import { QUALITIES } from './constants'
import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/** The MP3 bitrate, one choice per quality. */
export const QualitySection: FC = () => {
  const { current, save, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>MP3 quality</Text>
      {QUALITIES.map(q => (
        <Choice
          key={q.value}
          selected={current.quality === q.value}
          label={q.label}
          detail={q.detail}
          onPress={() => {
            save({ quality: q.value })
          }}
        />
      ))}
    </>
  )
}

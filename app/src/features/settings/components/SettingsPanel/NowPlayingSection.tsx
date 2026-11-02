import type { FC } from 'react'
import { Text } from 'react-native'

import { editorAvailable } from '@/features/editor/editorAvailable'

import { Checkbox } from './Checkbox'
import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/**
 * What the recorder does with what the system says is playing: tag a
 * recording of one song, and propose splits where the song changed (where
 * the track editor can open them).
 */
export const NowPlayingSection: FC = () => {
  const { current, save, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Now playing</Text>
      <Checkbox
        checked={current.nowPlayingTags}
        label="Tag recordings from now playing"
        detail="Fills in the title, artist, album and cover of a one-song recording from what the app says is playing · default"
        onPress={() => {
          save({ nowPlayingTags: !current.nowPlayingTags })
        }}
      />
      {editorAvailable && (
        <Checkbox
          checked={current.splitAtTrackChanges}
          label="Split at track changes"
          detail="Propose splits in the editor where the song changed, each track named and tagged · default"
          onPress={() => {
            save({ splitAtTrackChanges: !current.splitAtTrackChanges })
          }}
        />
      )}
    </>
  )
}

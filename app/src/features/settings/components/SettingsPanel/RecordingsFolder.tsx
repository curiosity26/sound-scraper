import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TextLink } from '@/shared/components/TextLink'

import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/** Where recordings are saved, with Choose… and Use default. */
export const RecordingsFolder: FC = () => {
  const { current, save, chooseFolder, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.section, textStyle]}>Recordings folder</Text>
      <Text selectable style={[styles.path, textStyle]}>
        {current.effectiveRecordingsDir}
      </Text>
      <View style={settingsStyles.row}>
        <TextLink
          label="Choose…"
          onPress={() => {
            chooseFolder()
          }}
          testName="choose-folder"
        />
        {current.recordingsDir !== null && (
          <TextLink
            label="Use default"
            onPress={() => {
              save({ recordingsDir: null })
            }}
          />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  path: { fontSize: 12, opacity: 0.8, marginBottom: 6 },
})

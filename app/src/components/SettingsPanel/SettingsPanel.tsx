import type { FC } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { editorAvailable } from '@/native/editorAvailable'
import { colors } from '@/theme/colors'

import { Choice } from './Choice'
import { QUALITIES } from './constants'
import { Masters } from './Masters'
import { settingsStyles } from './styles'
import { useAppSettings } from './useAppSettings'

export type SettingsPanelProps = {
  /** Shows a heading with Done (the overlay in the plain UI); the skinned
   * window has its own title and close button. */
  readonly onClose?: () => void
  readonly textStyle: object
}

/** App settings; each change is saved right away by the Rust core. */
export const SettingsPanel: FC<SettingsPanelProps> = props => {
  const { textStyle } = props
  const t = usePanelStyles()
  const { current, error, save, chooseFolder } = useAppSettings()

  return (
    <View style={styles.panel}>
      {props.onClose && (
        <View style={styles.header}>
          <Text style={[styles.heading, textStyle]}>Settings</Text>
          <Pressable onPress={props.onClose} testID="close-settings">
            <Text style={[settingsStyles.link, t.link]}>Done</Text>
          </Pressable>
        </View>
      )}
      <ScrollView>
        <Text style={[settingsStyles.section, textStyle]}>
          Recordings folder
        </Text>
        <Text selectable style={[styles.path, textStyle]}>
          {current.effectiveRecordingsDir}
        </Text>
        <View style={settingsStyles.row}>
          <Pressable
            onPress={() => {
              void chooseFolder()
            }}
            testID="choose-folder"
          >
            <Text style={[settingsStyles.link, t.link]}>Choose…</Text>
          </Pressable>
          {current.recordingsDir !== null && (
            <Pressable
              onPress={() => {
                void save({ recordingsDir: null })
              }}
            >
              <Text style={[settingsStyles.link, t.link]}>Use default</Text>
            </Pressable>
          )}
        </View>

        <Text style={[settingsStyles.section, textStyle]}>MP3 quality</Text>
        {QUALITIES.map(q => (
          <Choice
            key={q.value}
            selected={current.quality === q.value}
            label={q.label}
            detail={q.detail}
            onPress={() => {
              void save({ quality: q.value })
            }}
            textStyle={textStyle}
          />
        ))}

        <Text style={[settingsStyles.section, textStyle]}>Silence</Text>
        <Pressable
          onPress={() => {
            void save({ trimSilence: current.trimSilence === false })
          }}
          style={settingsStyles.choice}
          testID="trim-silence"
        >
          <Text style={[settingsStyles.choiceLabel, textStyle]}>
            {current.trimSilence !== false ? '☑ ' : '☐ '}
            Trim silence
          </Text>
          <Text style={[settingsStyles.choiceDetail, textStyle]}>
            Cuts the quiet before the first and after the last sound of a
            recording · default
          </Text>
        </Pressable>

        {editorAvailable && (
          <Masters current={current} save={save} textStyle={textStyle} />
        )}

        <Text style={[settingsStyles.section, textStyle]}>Tags</Text>
        <Choice
          selected={current.id3Version === '2.4'}
          label="ID3v2.4"
          detail={
            Platform.OS === 'windows'
              ? 'Modern players (Windows Explorer and Media Player can’t show its cover art)'
              : 'Modern players · default'
          }
          onPress={() => {
            void save({ id3Version: '2.4' })
          }}
          textStyle={textStyle}
        />
        <Choice
          selected={current.id3Version === '2.3'}
          label="ID3v2.3"
          detail={
            Platform.OS === 'windows'
              ? 'Widest compatibility, shows cover art in Windows · default'
              : 'For older players, car stereos and Windows'
          }
          onPress={() => {
            void save({ id3Version: '2.3' })
          }}
          textStyle={textStyle}
        />

        <Text style={[settingsStyles.note, textStyle]}>
          The last capture source you recorded is remembered and selected again
          when Sound Scraper starts.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600' },
  path: { fontSize: 12, opacity: 0.8, marginBottom: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 8 },
})

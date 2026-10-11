import type { FC } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { editorAvailable } from '@/native/editorAvailable'

import { Choice } from './Choice'
import { QUALITIES } from './constants'
import { Masters } from './Masters'
import { styles } from './styles'
import { useAppSettings } from './useAppSettings'

export type SettingsPanelProps = {
  /** Shows a heading with Done (the overlay in the plain UI); the skinned
   * window has its own title and close button. */
  readonly onClose?: () => void
  /** Called after a change that affects the library (folder). */
  readonly onFolderChanged: () => void
  readonly textStyle: object
}

/** App settings; each change is saved right away by the Rust core. */
export const SettingsPanel: FC<SettingsPanelProps> = props => {
  const { textStyle } = props
  const t = usePanelStyles()
  const { current, error, save, chooseFolder } = useAppSettings(
    props.onFolderChanged,
  )

  return (
    <View style={styles.panel}>
      {props.onClose && (
        <View style={styles.header}>
          <Text style={[styles.heading, textStyle]}>Settings</Text>
          <Pressable onPress={props.onClose} testID="close-settings">
            <Text style={[styles.link, t.link]}>Done</Text>
          </Pressable>
        </View>
      )}
      <ScrollView>
        <Text style={[styles.section, textStyle]}>Recordings folder</Text>
        <Text selectable style={[styles.path, textStyle]}>
          {current.effectiveRecordingsDir}
        </Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              void chooseFolder()
            }}
            testID="choose-folder"
          >
            <Text style={[styles.link, t.link]}>Choose…</Text>
          </Pressable>
          {current.recordingsDir !== null && (
            <Pressable
              onPress={() => {
                void save({ recordingsDir: null })
              }}
            >
              <Text style={[styles.link, t.link]}>Use default</Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.section, textStyle]}>MP3 quality</Text>
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

        <Text style={[styles.section, textStyle]}>Silence</Text>
        <Pressable
          onPress={() => {
            void save({ trimSilence: current.trimSilence === false })
          }}
          style={styles.choice}
          testID="trim-silence"
        >
          <Text style={[styles.choiceLabel, textStyle]}>
            {current.trimSilence !== false ? '☑ ' : '☐ '}
            Trim silence
          </Text>
          <Text style={[styles.choiceDetail, textStyle]}>
            Cuts the quiet before the first and after the last sound of a
            recording · default
          </Text>
        </Pressable>

        {editorAvailable && (
          <Masters current={current} save={save} textStyle={textStyle} />
        )}

        <Text style={[styles.section, textStyle]}>Tags</Text>
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

        <Text style={[styles.note, textStyle]}>
          The last capture source you recorded is remembered and selected again
          when Sound Scraper starts.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  )
}

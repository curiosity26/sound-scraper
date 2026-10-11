import { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native'

import { AboutPanel } from '@/components/AboutPanel'
import { LibraryScreen } from '@/components/LibraryScreen'
import { SettingsPanel } from '@/components/SettingsPanel'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { colors } from '@/theme/colors'
import { text } from '@/theme/text'

import { panelStyles } from './panelStyles'
import { RecordBar } from './RecordBar'
import { SourcePicker } from './SourcePicker'
import { useCaptureSources } from './useCaptureSources'
import { useCoreVersion } from './useCoreVersion'
import { useRecorderSession } from './useRecorderSession'

export const App: FC = () => {
  const isDark = useColorScheme() === 'dark'
  const fg = isDark ? text.dark : text.light
  const { version, error } = useCoreVersion()
  const sources = useCaptureSources()
  const recorder = useRecorderSession()
  const [overlay, setOverlay] = useState<'settings' | 'about'>()

  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, fg]}>Sound Scraper</Text>
        <View style={styles.headerLinks}>
          <Pressable
            onPress={() => {
              setOverlay('settings')
            }}
            testID="open-settings"
          >
            <Text style={styles.headerLink}>Settings</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setOverlay('about')
            }}
            testID="open-about"
          >
            <Text style={styles.headerLink}>About</Text>
          </Pressable>
        </View>
      </View>
      {version ? (
        <Text style={[styles.caption, fg]} testID="core-version">
          Rust core v{version}
        </Text>
      ) : (
        <Text style={[styles.caption, styles.error]}>
          Core bridge unavailable: {error}
        </Text>
      )}

      <SourcePicker
        apps={sources.apps}
        selectedPid={sources.selectedPid}
        onSelect={sources.select}
        onRefresh={sources.refresh}
        disabled={recorder.state !== 'idle' || recorder.starting}
        textStyle={fg}
      />

      <RecordBar
        state={recorder.state}
        starting={recorder.starting}
        elapsedMs={recorder.elapsedMs}
        peak={recorder.peak}
        onRecord={() => {
          void recorder.record(sources.selectedApp)
        }}
        onPause={recorder.pause}
        onResume={recorder.resume}
        onStop={() => {
          void recorder.stop()
        }}
        textStyle={fg}
      />

      {recorder.message && (
        <Text
          testID="recorder-message"
          selectable
          style={[styles.message, fg, recorder.message.isError && styles.error]}
        >
          {recorder.message.text}
        </Text>
      )}

      <LibraryScreen
        onMessage={recorder.setMessage}
        textStyle={fg}
        isDark={isDark}
      />

      {overlay && (
        <View
          style={[
            panelStyles.overlay,
            isDark ? styles.rootDark : styles.rootLight,
          ]}
        >
          {overlay === 'settings' ? (
            <SettingsPanel
              onClose={() => {
                setOverlay(undefined)
              }}
              onFolderChanged={refreshLibraryViews}
              textStyle={fg}
            />
          ) : (
            <AboutPanel
              onClose={() => {
                setOverlay(undefined)
              }}
              textStyle={fg}
            />
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  rootLight: { backgroundColor: '#ffffff' },
  rootDark: { backgroundColor: '#1e1e1e' },
  title: { fontSize: 28, fontWeight: '600' },
  caption: { fontSize: 14, marginTop: 4, marginBottom: 20, opacity: 0.7 },
  message: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: { flexDirection: 'row', gap: 16 },
  headerLink: { color: colors.accent, fontSize: 13 },
})

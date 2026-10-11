import { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AboutPanel } from '@/components/AboutPanel'
import { LibraryScreen } from '@/components/LibraryScreen'
import { SettingsPanel } from '@/components/SettingsPanel'
import { colors } from '@/theme/colors'

import { CoreVersion } from './CoreVersion'
import { RecordBar } from './RecordBar'
import { RecorderMessage } from './RecorderMessage'
import { recorderSession } from './recorderSession'
import { SourcePicker } from './SourcePicker'
import { useTextStyle } from './useTextStyle'

export const App: FC = () => {
  const { isDark, textStyle: fg } = useTextStyle()
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
      <CoreVersion />
      <SourcePicker />
      <RecordBar />
      <RecorderMessage />

      <LibraryScreen
        onMessage={recorderSession.setMessage}
        textStyle={fg}
        isDark={isDark}
      />

      {overlay && (
        <View
          style={[styles.overlay, isDark ? styles.rootDark : styles.rootLight]}
        >
          {overlay === 'settings' ? (
            <SettingsPanel
              onClose={() => {
                setOverlay(undefined)
              }}
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
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    padding: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: { flexDirection: 'row', gap: 16 },
  headerLink: { color: colors.accent, fontSize: 13 },
})

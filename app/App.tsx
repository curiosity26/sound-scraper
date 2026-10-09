import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native'

import { AboutPanel } from './src/AboutPanel'
import {
  errorText,
  rememberedPid,
  rememberSource,
  safeList,
  safeRecover,
  safeState,
} from './src/appHelpers'
import { LibraryScreen, refreshLibraryViews } from './src/LibraryScreen'
import { panelStyles, SettingsPanel } from './src/SettingsPanel'
import {
  type AudioApp,
  getCoreVersion,
  recorder,
  type RecorderState,
} from './src/native/SoundScraper'
import { RecordBar } from './src/RecordBar'
import { SourcePicker } from './src/SourcePicker'
import { colors, text } from './src/theme'

function useCoreVersion(): { version?: string; error?: string } {
  return useMemo(() => {
    try {
      return { version: getCoreVersion() }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [])
}

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark'
  const fg = isDark ? text.dark : text.light
  const { version, error } = useCoreVersion()

  const [apps, setApps] = useState<AudioApp[]>(() => safeList())
  const [selectedPid, setSelectedPid] = useState(() =>
    rememberedPid(safeList()),
  )
  const [state, setState] = useState<RecorderState>(() => safeState())
  const [starting, setStarting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [peak, setPeak] = useState(0)
  const [message, setMessage] = useState<{ text: string; isError: boolean }>()
  const [overlay, setOverlay] = useState<'settings' | 'about'>()

  useEffect(() => {
    const recovered = safeRecover()
    if (recovered > 0) {
      setMessage({
        text: `Recovered ${recovered} interrupted recording${
          recovered === 1 ? '' : 's'
        }.`,
        isError: false,
      })
    }
    const subscription = recorder.onEvent(e => {
      switch (e.kind) {
        case 'state':
          setState(e.state as RecorderState)
          if (e.state === 'idle') {
            setPeak(0)
          }
          break
        case 'progress':
          setElapsedMs(e.elapsedMs)
          setPeak(e.peak)
          break
        case 'finished':
          setMessage({ text: `Saved ${e.path}`, isError: false })
          break
        case 'error':
          setMessage({ text: `Recording failed: ${e.message}`, isError: true })
          break
      }
    })
    return () => subscription.remove()
  }, [])

  const onRecord = useCallback(async () => {
    setStarting(true)
    setMessage(undefined)
    setElapsedMs(0)
    try {
      const app = apps.find(a => a.pid === selectedPid)
      await recorder.start(app)
      rememberSource(app)
    } catch (e) {
      setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true })
    } finally {
      setStarting(false)
    }
  }, [apps, selectedPid])

  const onStop = useCallback(async () => {
    try {
      await recorder.stop()
    } catch (e) {
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true })
    }
  }, [])

  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, fg]}>Sound Scraper</Text>
        <View style={styles.headerLinks}>
          <Pressable
            onPress={() => setOverlay('settings')}
            testID="open-settings"
          >
            <Text style={styles.headerLink}>Settings</Text>
          </Pressable>
          <Pressable onPress={() => setOverlay('about')} testID="open-about">
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
        apps={apps}
        selectedPid={selectedPid}
        onSelect={setSelectedPid}
        onRefresh={() => setApps(safeList())}
        disabled={state !== 'idle' || starting}
        textStyle={fg}
      />

      <RecordBar
        state={state}
        starting={starting}
        elapsedMs={elapsedMs}
        peak={peak}
        onRecord={onRecord}
        onPause={recorder.pause}
        onResume={recorder.resume}
        onStop={onStop}
        textStyle={fg}
      />

      {message && (
        <Text
          testID="recorder-message"
          selectable
          style={[styles.message, fg, message.isError && styles.error]}
        >
          {message.text}
        </Text>
      )}

      <LibraryScreen onMessage={setMessage} textStyle={fg} isDark={isDark} />

      {overlay && (
        <View
          style={[
            panelStyles.overlay,
            isDark ? styles.rootDark : styles.rootLight,
          ]}
        >
          {overlay === 'settings' ? (
            <SettingsPanel
              onClose={() => setOverlay(undefined)}
              onFolderChanged={refreshLibraryViews}
              textStyle={fg}
            />
          ) : (
            <AboutPanel onClose={() => setOverlay(undefined)} textStyle={fg} />
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

export default App

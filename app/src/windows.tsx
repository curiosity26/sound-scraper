// Roots of the skinned UI's windows (registered in index.js). They share one
// JS runtime, so the skin and library refreshes are shared between them.
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { AboutPanel } from './AboutPanel';
import { LibraryScreen, refreshLibraryViews } from './LibraryScreen';
import { SettingsPanel } from './SettingsPanel';
import { MainPanel } from './skin/MainPanel';
import { SkinChooser } from './skin/SkinChooser';
import { SkinProvider } from './skin/SkinProvider';
import { windows } from './skin/skins';
import { colors, text } from './theme';
import type { Message } from './useRecorder';

/** The main window: the skinned panel. */
export function MainApp(): React.JSX.Element {
  const [error, setError] = useState<string>();
  return (
    <SkinProvider
      onError={setError}
      fallback={
        error ? (
          <View style={styles.skinError}>
            <Text selectable style={styles.skinErrorText}>
              Couldn't load the skin: {error}
            </Text>
          </View>
        ) : null
      }
    >
      <MainPanel />
    </SkinProvider>
  );
}

function usePlainTheme() {
  const isDark = useColorScheme() === 'dark';
  return {
    isDark,
    fg: isDark ? text.dark : text.light,
    bg: isDark ? styles.rootDark : styles.rootLight,
  };
}

/** The library window. */
export function LibraryApp(): React.JSX.Element {
  const { isDark, fg, bg } = usePlainTheme();
  const [message, setMessage] = useState<Message>();
  return (
    <View style={[styles.root, bg]}>
      <LibraryScreen onMessage={setMessage} textStyle={fg} isDark={isDark} />
      {message && (
        <Text
          selectable
          style={[styles.message, fg, message.isError && styles.error]}
        >
          {message.text}
        </Text>
      )}
    </View>
  );
}

/** The settings window: settings, skin and about. */
export function SettingsApp(): React.JSX.Element {
  const { fg, bg } = usePlainTheme();
  const [tab, setTab] = useState<'settings' | 'skin' | 'about'>('settings');
  const hide = () => windows.setPanelVisible('settings', false);
  return (
    <View style={[styles.root, bg]}>
      <View style={styles.tabs}>
        {(['settings', 'skin', 'about'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} testID={`tab-${t}`}>
            <Text style={[styles.tab, fg, tab === t && styles.tabActive]}>
              {t === 'settings' ? 'Settings' : t === 'skin' ? 'Skin' : 'About'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'settings' && (
        <SettingsPanel
          onClose={hide}
          onFolderChanged={refreshLibraryViews}
          textStyle={fg}
        />
      )}
      {tab === 'skin' && (
        <ScrollView>
          <SkinChooser textStyle={fg} />
        </ScrollView>
      )}
      {tab === 'about' && (
        <AboutPanel onClose={() => setTab('settings')} textStyle={fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  rootLight: { backgroundColor: '#ffffff' },
  rootDark: { backgroundColor: '#1e1e1e' },
  message: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
  tabs: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  tab: { fontSize: 14, opacity: 0.6, paddingBottom: 4 },
  tabActive: {
    opacity: 1,
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  skinError: {
    flex: 1,
    padding: 12,
    backgroundColor: '#2a2522',
    borderRadius: 6,
  },
  skinErrorText: { color: '#f3ead0', fontSize: 12 },
});

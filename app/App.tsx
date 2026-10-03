import React, { useMemo } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { getCoreVersion } from './src/native/SoundScraper';

function useCoreVersion(): { version?: string; error?: string } {
  return useMemo(() => {
    try {
      return { version: getCoreVersion() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, []);
}

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const { version, error } = useCoreVersion();
  const fg = isDark ? '#f2f2f2' : '#1a1a1a';

  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <Text style={[styles.title, { color: fg }]}>Sound Scraper</Text>
      {version ? (
        <Text style={[styles.body, { color: fg }]} testID="core-version">
          Rust core v{version}
        </Text>
      ) : (
        <Text style={[styles.body, styles.error]}>
          Core bridge unavailable: {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rootLight: { backgroundColor: '#ffffff' },
  rootDark: { backgroundColor: '#1e1e1e' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 16 },
  error: { color: '#c62828' },
});

export default App;

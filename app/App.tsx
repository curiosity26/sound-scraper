import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import {
  type AudioApp,
  getCoreVersion,
  listAudioApps,
  recorder,
  type RecorderState,
} from './src/native/SoundScraper';
import { RecordBar } from './src/RecordBar';
import { SourcePicker } from './src/SourcePicker';
import { colors, text } from './src/theme';

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
  const fg = isDark ? text.dark : text.light;
  const { version, error } = useCoreVersion();

  const [apps, setApps] = useState<AudioApp[]>(() => safeList());
  const [selectedPid, setSelectedPid] = useState(0);
  const [state, setState] = useState<RecorderState>(() => safeState());
  const [starting, setStarting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [peak, setPeak] = useState(0);
  const [message, setMessage] = useState<{ text: string; isError: boolean }>();

  useEffect(() => {
    const recovered = safeRecover();
    if (recovered > 0) {
      setMessage({
        text: `Recovered ${recovered} interrupted recording${
          recovered === 1 ? '' : 's'
        }.`,
        isError: false,
      });
    }
    const subscription = recorder.onEvent(e => {
      switch (e.kind) {
        case 'state':
          setState(e.state as RecorderState);
          if (e.state === 'idle') {
            setPeak(0);
          }
          break;
        case 'progress':
          setElapsedMs(e.elapsedMs);
          setPeak(e.peak);
          break;
        case 'finished':
          setMessage({ text: `Saved ${e.path}`, isError: false });
          break;
        case 'error':
          setMessage({ text: `Recording failed: ${e.message}`, isError: true });
          break;
      }
    });
    return () => subscription.remove();
  }, []);

  const onRecord = useCallback(async () => {
    setStarting(true);
    setMessage(undefined);
    setElapsedMs(0);
    try {
      await recorder.start(apps.find(a => a.pid === selectedPid));
    } catch (e) {
      setMessage({ text: `Couldn't start: ${errorText(e)}`, isError: true });
    } finally {
      setStarting(false);
    }
  }, [apps, selectedPid]);

  const onStop = useCallback(async () => {
    try {
      await recorder.stop();
    } catch (e) {
      setMessage({ text: `Couldn't save: ${errorText(e)}`, isError: true });
    }
  }, []);

  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <Text style={[styles.title, fg]}>Sound Scraper</Text>
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
    </View>
  );
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function safeList(): AudioApp[] {
  try {
    return listAudioApps();
  } catch {
    return [];
  }
}

function safeState(): RecorderState {
  try {
    return recorder.state();
  } catch {
    return 'idle';
  }
}

function safeRecover(): number {
  try {
    return recorder.recoverPartials();
  } catch {
    return 0;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  rootLight: { backgroundColor: '#ffffff' },
  rootDark: { backgroundColor: '#1e1e1e' },
  title: { fontSize: 28, fontWeight: '600' },
  caption: { fontSize: 14, marginTop: 4, marginBottom: 20, opacity: 0.7 },
  message: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
});

export default App;

import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {
  type AudioApp,
  getCoreVersion,
  listAudioApps,
  recordTestWav,
} from './src/native/SoundScraper';

const TEST_SECONDS = 10;

function useCoreVersion(): { version?: string; error?: string } {
  return useMemo(() => {
    try {
      return { version: getCoreVersion() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, []);
}

type Status =
  | { kind: 'idle' }
  | { kind: 'recording'; label: string }
  | { kind: 'done'; text: string; silent: boolean }
  | { kind: 'error'; text: string };

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const { version, error } = useCoreVersion();
  const [apps, setApps] = useState<AudioApp[]>(() => safeList());
  const [selectedPid, setSelectedPid] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fg = isDark ? styles.fgDark : styles.fgLight;

  const refresh = useCallback(() => setApps(safeList()), []);

  const record = useCallback(async () => {
    const app = apps.find(a => a.pid === selectedPid);
    setStatus({ kind: 'recording', label: app?.name ?? 'all system audio' });
    try {
      const r = await recordTestWav(TEST_SECONDS, app);
      const seconds = (r.frames / r.sampleRate).toFixed(1);
      setStatus({
        kind: 'done',
        silent: r.peak === 0,
        text: `${seconds} s · ${r.sampleRate} Hz · ${
          r.channels
        } ch · peak ${r.peak.toFixed(3)}\n${r.path}`,
      });
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }, [apps, selectedPid]);

  const recording = status.kind === 'recording';

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

      <View style={styles.headerRow}>
        <Text style={[styles.section, fg]}>Source</Text>
        <Pressable onPress={refresh} disabled={recording}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.list}>
        <SourceRow
          label="All system audio"
          selected={selectedPid === 0}
          onPress={() => setSelectedPid(0)}
          fg={fg}
        />
        {apps.map(app => (
          <SourceRow
            key={app.pid}
            label={`${app.isPlaying ? '♪ ' : ''}${app.name}`}
            selected={selectedPid === app.pid}
            onPress={() => setSelectedPid(app.pid)}
            fg={fg}
          />
        ))}
      </ScrollView>

      <Pressable
        testID="record-test"
        style={[styles.button, recording && styles.buttonDisabled]}
        disabled={recording}
        onPress={record}
      >
        <Text style={styles.buttonText}>
          {recording ? 'Recording…' : `Record ${TEST_SECONDS} s test`}
        </Text>
      </Pressable>

      <Text
        testID="capture-status"
        selectable
        style={[
          styles.status,
          fg,
          (status.kind === 'error' ||
            (status.kind === 'done' && status.silent)) &&
            styles.error,
        ]}
      >
        {statusText(status)}
      </Text>
    </View>
  );
}

function SourceRow(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
  fg: object;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.row, props.selected && styles.rowSelected]}
    >
      <Text style={[styles.rowText, props.fg]}>
        {props.selected ? '● ' : '○ '}
        {props.label}
      </Text>
    </Pressable>
  );
}

function statusText(status: Status): string {
  switch (status.kind) {
    case 'idle':
      return 'Play something, pick a source, then record.';
    case 'recording':
      return `Recording ${TEST_SECONDS} s of ${status.label}…`;
    case 'done':
      return status.silent
        ? `Recorded only silence. Check the System Audio Recording permission.\n${status.text}`
        : `Saved: ${status.text}`;
    case 'error':
      return `Capture failed: ${status.text}`;
  }
}

function safeList(): AudioApp[] {
  try {
    return listAudioApps();
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  rootLight: { backgroundColor: '#ffffff' },
  rootDark: { backgroundColor: '#1e1e1e' },
  fgLight: { color: '#1a1a1a' },
  fgDark: { color: '#f2f2f2' },
  title: { fontSize: 28, fontWeight: '600' },
  caption: { fontSize: 14, marginTop: 4, marginBottom: 20, opacity: 0.7 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  section: { fontSize: 16, fontWeight: '600' },
  link: { color: '#2f6fde', fontSize: 14 },
  list: {
    flexGrow: 0,
    maxHeight: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8884',
    borderRadius: 6,
  },
  row: { paddingVertical: 6, paddingHorizontal: 10 },
  rowSelected: { backgroundColor: '#2f6fde22' },
  rowText: { fontSize: 14 },
  button: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#2f6fde',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  status: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  error: { color: '#c62828' },
});

export default App;

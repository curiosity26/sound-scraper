import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { LibraryTable } from './src/LibraryTable';
import { TagEditor } from './src/TagEditor';
import { AboutPanel } from './src/AboutPanel';
import { panelStyles, SettingsPanel } from './src/SettingsPanel';
import {
  type AudioApp,
  getCoreVersion,
  library,
  listAudioApps,
  recorder,
  type RecorderState,
  settings,
  type Recording,
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
  const [selectedPid, setSelectedPid] = useState(() => rememberedPid(apps0()));
  const [state, setState] = useState<RecorderState>(() => safeState());
  const [starting, setStarting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [peak, setPeak] = useState(0);
  const [message, setMessage] = useState<{ text: string; isError: boolean }>();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tagTargets, setTagTargets] = useState<string[]>();
  const [overlay, setOverlay] = useState<'settings' | 'about'>();

  const refreshLibrary = useCallback(async () => {
    try {
      setRecordings(await library.list());
    } catch (e) {
      setMessage({
        text: `Couldn't read the library: ${errorText(e)}`,
        isError: true,
      });
    }
  }, []);

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
    refreshLibrary();
    const librarySubscription = library.onChanged(refreshLibrary);
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
    return () => {
      subscription.remove();
      librarySubscription.remove();
    };
  }, [refreshLibrary]);

  useEffect(() => {
    const names = new Set(recordings.map(r => r.fileName));
    setChecked(prev => {
      const next = new Set([...prev].filter(n => names.has(n)));
      return next.size === prev.size ? prev : next;
    });
    setTagTargets(prev => {
      const next = prev?.filter(n => names.has(n));
      return next && next.length === prev?.length ? prev : next;
    });
  }, [recordings]);

  const onRename = useCallback(
    async (r: Recording, newName: string) => {
      try {
        const renamed = await library.rename(r.fileName, newName);
        setMessage({ text: `Renamed to ${renamed}`, isError: false });
      } catch (e) {
        setMessage({ text: `Couldn't rename: ${errorText(e)}`, isError: true });
      }
      refreshLibrary();
    },
    [refreshLibrary],
  );

  const onTrash = useCallback(
    async (r: Recording) => {
      try {
        await library.trash(r.fileName);
      } catch (e) {
        setMessage({
          text: `Couldn't move to Trash: ${errorText(e)}`,
          isError: true,
        });
      }
      refreshLibrary();
    },
    [refreshLibrary],
  );

  const onRecord = useCallback(async () => {
    setStarting(true);
    setMessage(undefined);
    setElapsedMs(0);
    try {
      const app = apps.find(a => a.pid === selectedPid);
      await recorder.start(app);
      rememberSource(app);
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

      <View style={styles.libraryRow}>
        <LibraryTable
          recordings={recordings}
          onRename={onRename}
          onTrash={onTrash}
          onReveal={r => library.reveal(r.fileName)}
          onEditTags={setTagTargets}
          checked={checked}
          onCheckedChange={setChecked}
          textStyle={fg}
          isDark={isDark}
        />
        {tagTargets && tagTargets.length > 0 && (
          <TagEditor
            fileNames={tagTargets}
            onSaved={refreshLibrary}
            defaultId3v23={safeSettings()?.id3Version === '2.3'}
            onClose={() => setTagTargets(undefined)}
            textStyle={fg}
            isDark={isDark}
          />
        )}
      </View>

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
              onFolderChanged={refreshLibrary}
              textStyle={fg}
            />
          ) : (
            <AboutPanel onClose={() => setOverlay(undefined)} textStyle={fg} />
          )}
        </View>
      )}
    </View>
  );
}

function apps0(): AudioApp[] {
  return safeList();
}

function safeSettings() {
  try {
    return settings.get();
  } catch {
    return undefined;
  }
}

/** The PID of the remembered app if it's running, else 0 (system audio). */
function rememberedPid(apps: AudioApp[]): number {
  const last = safeSettings()?.lastSource;
  if (last?.kind !== 'app') {
    return 0;
  }
  const match = apps.find(
    a => (last.id && a.bundleId === last.id) || a.name === last.name,
  );
  return match?.pid ?? 0;
}

function rememberSource(app: AudioApp | undefined) {
  const current = safeSettings();
  if (!current) {
    return;
  }
  const lastSource = app
    ? { kind: 'app' as const, id: app.bundleId, name: app.name }
    : { kind: 'system' as const };
  settings.set({ ...current, lastSource }).catch(() => {});
}

function errorText(e: unknown): string {
  // Native rejections arrive as Error on macOS but as plain
  // {code, message} objects on Windows.
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
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
  libraryRow: { flex: 1, flexDirection: 'row' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: { flexDirection: 'row', gap: 16 },
  headerLink: { color: colors.accent, fontSize: 13 },
});

export default App;

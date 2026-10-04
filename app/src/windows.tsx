// Roots of the skinned UI's windows (registered in index.js). They share one
// JS runtime, so the skin and library refreshes are shared between them.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AboutPanel } from './AboutPanel';
import { DetailsPane } from './DetailsPane';
import { LibraryScreen, refreshLibraryViews } from './LibraryScreen';
import { SettingsPanel } from './SettingsPanel';
import { MainPanel } from './skin/MainPanel';
import { SkinChooser } from './skin/SkinChooser';
import { SkinPanelFrame } from './skin/SkinPanelFrame';
import { SkinProvider, useSkin } from './skin/SkinProvider';
import { SkinScale } from './skin/SkinImage';
import { doubleSizeStore, windows } from './skin/skins';
import { colors } from './theme';
import { selection } from './selection';
import type { Message } from './useRecorder';

/** Double size (⌘D), shared by every window. */
function useDoubleSize(): boolean {
  const [double, setDouble] = useState(doubleSizeStore.get);
  useEffect(() => doubleSizeStore.subscribe(setDouble), []);
  return double;
}

/** The skin, at the current scale, around a window's content. */
function Skinned(props: { children: React.ReactNode }): React.JSX.Element {
  const [error, setError] = useState<string>();
  const double = useDoubleSize();
  return (
    <SkinScale.Provider value={double ? 2 : 1}>
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
        {props.children}
      </SkinProvider>
    </SkinScale.Provider>
  );
}

/** The main window: the skinned panel. */
export function MainApp(): React.JSX.Element {
  useEffect(() => {
    // Window › Double Size (⌘D).
    const subscription = windows.onEvent(e => {
      if (e.window === 'main' && e.event === 'toggleDoubleSize') {
        doubleSizeStore.set(!doubleSizeStore.get());
      }
    });
    return () => subscription.remove();
  }, []);
  return (
    <Skinned>
      <MainPanel />
    </Skinned>
  );
}

/** Text color and whether the panel is dark, from the skin's controls. */
function usePanelText(panel: 'library' | 'settings' | 'details') {
  const skin = useSkin();
  const c = skin.panels[panel].controls;
  return {
    fg: { color: c.text ?? '#f2f2f2' },
    isDark: isDarkColor(c.background ?? '#1e1e1e'),
  };
}

export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const v = (i: number) =>
    parseInt(h.length < 6 ? h[i] + h[i] : h.slice(i * 2, i * 2 + 2), 16);
  return 0.299 * v(0) + 0.587 * v(1) + 0.114 * v(2) < 128;
}

function LibraryContent(props: { onCount: (n: number) => void }) {
  const { fg, isDark } = usePanelText('library');
  const [message, setMessage] = useState<Message>();
  return (
    <View style={styles.content}>
      <LibraryScreen
        onMessage={setMessage}
        textStyle={fg}
        isDark={isDark}
        compact
        onCount={props.onCount}
        openDetails={() => windows.setPanelVisible('details', true)}
      />
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

/** The library window. */
export function LibraryApp(): React.JSX.Element {
  const [count, setCount] = useState<number>();
  return (
    <Skinned>
      <SkinPanelFrame
        panel="library"
        title={count === undefined ? 'Library' : `Library (${count})`}
      >
        <LibraryContent onCount={setCount} />
      </SkinPanelFrame>
    </Skinned>
  );
}

function SettingsContent() {
  const { fg } = usePanelText('settings');
  const skin = useSkin();
  const accent = skin.panels.settings.controls.accent ?? colors.accent;
  const [tab, setTab] = useState<'settings' | 'skin' | 'about'>('settings');
  return (
    <View style={styles.content}>
      <View style={styles.tabs}>
        {(['settings', 'skin', 'about'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} testID={`tab-${t}`}>
            <Text
              style={[
                styles.tab,
                fg,
                tab === t && [styles.tabActive, { borderBottomColor: accent }],
              ]}
            >
              {t === 'settings' ? 'Settings' : t === 'skin' ? 'Skin' : 'About'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'settings' && (
        <SettingsPanel onFolderChanged={refreshLibraryViews} textStyle={fg} />
      )}
      {tab === 'skin' && (
        <ScrollView>
          <SkinChooser textStyle={fg} />
        </ScrollView>
      )}
      {tab === 'about' && <AboutPanel textStyle={fg} />}
    </View>
  );
}

function DetailsContent(props: {
  menuRef: { current?: (x: number, y: number) => void };
}) {
  const { fg, isDark } = usePanelText('details');
  const [fileNames, setFileNames] = useState(selection.get());
  useEffect(() => selection.subscribe(setFileNames), []);
  const close = () => windows.setPanelVisible('details', false);
  if (fileNames.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={[styles.message, fg]}>
          Click a recording in the library to see its details.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.content}>
      <DetailsPane
        fileNames={fileNames}
        onRenamed={(_, renamed) => selection.set([renamed])}
        onChanged={refreshLibraryViews}
        onClose={close}
        showMenu={(items, x, y) => windows.showMenu(items, -1, x, y, 'details')}
        menuRef={props.menuRef}
        textStyle={fg}
        isDark={isDark}
      />
    </View>
  );
}

/** The details window: the selected recording(s). Closing it deselects. */
export function DetailsApp(): React.JSX.Element {
  const [count, setCount] = useState(selection.get().length);
  const menuRef = useRef<(x: number, y: number) => void>(undefined);
  useEffect(() => {
    const unsubscribe = selection.subscribe(names => setCount(names.length));
    const subscription = windows.onEvent(e => {
      if (e.window === 'details' && e.event === 'hidden') {
        selection.set([]);
      }
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, []);
  return (
    <Skinned>
      <SkinPanelFrame
        panel="details"
        title={count > 1 ? `Details (${count})` : 'Details'}
        onMenu={count > 0 ? (x, y) => menuRef.current?.(x, y) : undefined}
      >
        <DetailsContent menuRef={menuRef} />
      </SkinPanelFrame>
    </Skinned>
  );
}

/** The settings window: settings, skin and about. */
export function SettingsApp(): React.JSX.Element {
  return (
    <Skinned>
      <SkinPanelFrame panel="settings" title="Settings">
        <SettingsContent />
      </SkinPanelFrame>
    </Skinned>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 12 },
  message: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
  tabs: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  tab: { fontSize: 14, opacity: 0.6, paddingBottom: 4 },
  tabActive: {
    opacity: 1,
    fontWeight: '600',
    borderBottomWidth: 2,
  },
  skinError: {
    flex: 1,
    padding: 12,
    backgroundColor: '#2a2522',
    borderRadius: 6,
  },
  skinErrorText: { color: '#f3ead0', fontSize: 12 },
});

if (__DEV__) {
  // Lets the debugger drive the panels (see also native/SoundScraper.ts).
  const g = globalThis as { __soundScraper?: Record<string, unknown> };
  g.__soundScraper = { ...g.__soundScraper, selection, windows };
}

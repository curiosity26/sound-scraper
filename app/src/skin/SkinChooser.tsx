import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorText, safeSettings } from '../appHelpers';
import { settings } from '../native/SoundScraper';
import { usePanelStyles } from '../panelTheme';
import { colors } from '../theme';
import { doubleSizeStore, skins, skinStore } from './skins';
import type { SkinSummary } from './types';

/**
 * Picks the skin: installed skins, installing a .sskin, or using an
 * unpacked folder (for skin authors). A minimal chooser until the skin
 * browser arrives.
 */
export function SkinChooser(props: { textStyle: object }): React.JSX.Element {
  const { textStyle } = props;
  const t = usePanelStyles();
  const [list, setList] = useState<SkinSummary[]>([]);
  const [chosen, setChosen] = useState<string | null>(
    () => safeSettings()?.skin ?? null,
  );
  const [error, setError] = useState<string>();
  const [double, setDouble] = useState(doubleSizeStore.get);
  useEffect(() => doubleSizeStore.subscribe(setDouble), []);
  const [warnings, setWarnings] = useState<string[]>(
    () => skinStore.get()?.warnings ?? [],
  );

  const refresh = useCallback(async () => {
    try {
      setList(await skins.list());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    return skinStore.subscribe(skin => setWarnings(skin.warnings));
  }, [refresh]);

  const choose = async (skin: string | null) => {
    setError(undefined);
    try {
      await settings.set({ ...settings.get(), skin });
      setChosen(skin);
      await skinStore.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const install = async () => {
    const path = await skins.pickArchive();
    if (!path) {
      return;
    }
    setError(undefined);
    try {
      const installed = await skins.install(path);
      await refresh();
      await choose(installed.id);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const useFolder = async () => {
    const dir = await skins.pickFolder();
    if (dir) {
      await choose(dir);
    }
  };

  const remove = async (skin: SkinSummary) => {
    setError(undefined);
    try {
      if (chosen === skin.id) {
        await choose(null);
      }
      await skins.remove(skin.id);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const isChosen = (s: SkinSummary) =>
    s.builtin ? !chosen || chosen === s.id : chosen === s.id;
  const folderInUse = chosen?.startsWith('/') ? chosen : null;

  return (
    <View>
      {list.map(s => (
        <View key={s.id} style={styles.row}>
          <Pressable
            testID={`skin-${s.id}`}
            disabled={s.error != null}
            onPress={() => choose(s.builtin ? null : s.id)}
            style={styles.choice}
          >
            <Text
              style={[styles.label, textStyle, s.error != null && styles.muted]}
            >
              {isChosen(s) ? '◉' : '○'} {s.name}
              {s.version ? ` ${s.version}` : ''}
              {s.author ? ` · ${s.author}` : ''}
            </Text>
            {s.error && <Text style={styles.error}>{s.error}</Text>}
          </Pressable>
          {!s.builtin && (
            <Pressable onPress={() => remove(s)}>
              <Text style={[styles.link, t.link]}>Remove</Text>
            </Pressable>
          )}
        </View>
      ))}
      {folderInUse && (
        <Text style={[styles.label, textStyle]}>◉ Folder: {folderInUse}</Text>
      )}
      <Pressable
        testID="double-size"
        onPress={() => doubleSizeStore.set(!double)}
        style={styles.choice}
      >
        <Text style={[styles.label, textStyle]}>
          {double ? '☑' : '☐'} Double size (
          {Platform.OS === 'windows' ? 'Ctrl+D' : '⌘D'})
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={install} testID="install-skin">
          <Text style={[styles.link, t.link]}>Install skin…</Text>
        </Pressable>
        <Pressable onPress={useFolder}>
          <Text style={[styles.link, t.link]}>Use skin folder…</Text>
        </Pressable>
        {folderInUse && (
          <Pressable onPress={() => choose(folderInUse)}>
            <Text style={[styles.link, t.link]}>Reload folder</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {warnings.map((w, i) => (
        <Text key={i} style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  choice: { paddingVertical: 4, flex: 1 },
  label: { fontSize: 13 },
  muted: { opacity: 0.5 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  link: { color: colors.accent, fontSize: 13 },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
  warning: { fontSize: 11, opacity: 0.7, marginTop: 4 },
});

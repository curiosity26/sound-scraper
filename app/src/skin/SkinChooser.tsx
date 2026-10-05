import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { errorText, safeSettings } from '../appHelpers';
import { usePanelStyles } from '../panelTheme';
import { colors } from '../theme';
import { fileUri } from './SkinImage';
import {
  chooseSkin,
  doubleSizeStore,
  isFolderSkin,
  pendingInstall,
  skinMessages,
  skins,
  skinStore,
} from './skins';
import type { SkinInspection, SkinSummary } from './types';

const CARD_W = 196;

/**
 * Settings › Skin: the installed skins as a grid of pictures, the install
 * card for a .sskin being opened, and tools for skin authors (a folder
 * that reloads as it changes, packaging, a starter template).
 */
export function SkinChooser(props: { textStyle: object }): React.JSX.Element {
  const { textStyle } = props;
  const t = usePanelStyles();
  const [list, setList] = useState<SkinSummary[]>([]);
  const [chosen, setChosen] = useState<string | null>(
    () => safeSettings()?.skin ?? null,
  );
  // Shared, so they survive the window re-mounting for a new skin.
  const [{ note, error }, setMessage] = useState(skinMessages.get);
  useEffect(() => skinMessages.subscribe(setMessage), []);
  const setNote = (text?: string) => skinMessages.set({ note: text });
  const setError = (text?: string) => skinMessages.set({ error: text });
  const [double, setDouble] = useState(doubleSizeStore.get);
  useEffect(() => doubleSizeStore.subscribe(setDouble), []);
  const [warnings, setWarnings] = useState<string[]>(
    () => skinStore.get()?.warnings ?? [],
  );
  const [pending, setPending] = useState(pendingInstall.get);
  useEffect(() => pendingInstall.subscribe(setPending), []);
  const [naming, setNaming] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setList(await skins.list());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    return skinStore.subscribe(skin => {
      setWarnings(skin.warnings);
      setChosen(safeSettings()?.skin ?? null);
    });
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    skinMessages.set({});
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const choose = (skin: string | null) =>
    run(async () => {
      await chooseSkin(skin);
      setChosen(skin);
    });

  const pickAndInspect = async () => {
    const path = await skins.pickArchive();
    if (path) {
      await run(async () =>
        pendingInstall.set({ inspection: await skins.inspect(path) }),
      );
    }
  };

  const install = (inspection: SkinInspection) =>
    run(async () => {
      pendingInstall.set(null);
      const installed = await skins.install(inspection.path);
      await refresh();
      await chooseSkin(installed.id);
      setChosen(installed.id);
      setNote(`Installed ${installed.name}.`);
    });

  const useFolder = async () => {
    const dir = await skins.pickFolder();
    if (dir) {
      await choose(dir);
    }
  };

  const create = (name: string) =>
    run(async () => {
      const parent = await skins.pickAnyFolder(
        'Where should the new skin go?',
        'Create Skin Here',
      );
      if (!parent) {
        return;
      }
      setNaming(undefined);
      const dir = await skins.create(parent, name);
      await chooseSkin(dir);
      setChosen(dir);
      setNote(
        `Made ${name} from the Default skin. Edit its files and the app ` +
          'updates as you save. README.md in the folder explains the format.',
      );
    });

  const packageFolder = (dir: string) =>
    run(async () => {
      const name = skinStore.get()?.name ?? 'Skin';
      const out = await skins.pickSaveLocation(`${name}.sskin`);
      if (!out) {
        return;
      }
      const packaged = await skins.package(dir, out);
      setNote(`Packaged ${packaged.name} as ${packaged.dir}.`);
    });

  const remove = (skin: SkinSummary) =>
    run(async () => {
      if (chosen === skin.id) {
        await chooseSkin(null);
        setChosen(null);
      }
      await skins.remove(skin.id);
      await refresh();
    });

  const isChosen = (s: SkinSummary) =>
    s.builtin ? !chosen || chosen === s.id : chosen === s.id;
  const folderInUse = isFolderSkin(chosen) ? chosen : null;
  const modifier = Platform.OS === 'windows' ? 'Ctrl+D' : '⌘D';

  return (
    <View>
      {pending && 'inspection' in pending && (
        <InstallCard
          inspection={pending.inspection}
          onInstall={() => install(pending.inspection)}
          onCancel={() => pendingInstall.set(null)}
          textStyle={textStyle}
        />
      )}
      {pending && 'error' in pending && (
        <View style={[styles.card, styles.installCard, t.border]}>
          <Text style={[styles.title, textStyle]}>
            Couldn't open {baseName(pending.path)}
          </Text>
          <Text selectable style={styles.error}>
            {pending.error}
          </Text>
          <Pressable onPress={() => pendingInstall.set(null)}>
            <Text style={[styles.link, t.link]}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.grid}>
        {folderInUse && (
          <SkinCard
            name={skinStore.get()?.name ?? baseName(folderInUse)}
            detail={`Live from ${baseName(folderInUse)}`}
            preview={folderInUse}
            chosen
            textStyle={textStyle}
          >
            <Pressable onPress={() => packageFolder(folderInUse)}>
              <Text style={[styles.link, t.link]}>Package skin…</Text>
            </Pressable>
            <Pressable onPress={() => choose(null)}>
              <Text style={[styles.link, t.link]}>Stop</Text>
            </Pressable>
          </SkinCard>
        )}
        {list.map(s => (
          <SkinCard
            key={s.id}
            testID={`skin-${s.id}`}
            name={s.name + (s.version ? ` ${s.version}` : '')}
            detail={s.author ?? (s.builtin ? 'Built in' : '')}
            preview={s.error ? null : s.builtin ? '' : s.id}
            chosen={isChosen(s) && !folderInUse}
            error={s.error}
            onPress={
              s.error == null
                ? () => choose(s.builtin ? null : s.id)
                : undefined
            }
            textStyle={textStyle}
          >
            {!s.builtin && (
              <Pressable onPress={() => remove(s)}>
                <Text style={[styles.link, t.link]}>Remove</Text>
              </Pressable>
            )}
          </SkinCard>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={pickAndInspect} testID="install-skin">
          <Text style={[styles.link, t.link]}>Install skin…</Text>
        </Pressable>
        <Pressable onPress={useFolder}>
          <Text style={[styles.link, t.link]}>Use skin folder…</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            setNaming(naming === undefined ? 'My Skin' : undefined)
          }
        >
          <Text style={[styles.link, t.link]}>New skin from template…</Text>
        </Pressable>
      </View>
      {naming !== undefined && (
        <View style={styles.nameRow}>
          <TextInput
            value={naming}
            onChangeText={setNaming}
            onSubmitEditing={() => naming.trim() && create(naming.trim())}
            placeholder="Skin name"
            style={[styles.input, t.input]}
            autoFocus
          />
          <Pressable
            disabled={!naming.trim()}
            onPress={() => create(naming.trim())}
            style={[styles.button, t.button]}
          >
            <Text style={[styles.buttonText, t.buttonText]}>
              Choose folder…
            </Text>
          </Pressable>
        </View>
      )}
      <Text style={[styles.hint, textStyle]}>
        Tip: double-click a .sskin file, or drop it on any Sound Scraper window,
        to install it.
      </Text>

      <Pressable
        testID="double-size"
        onPress={() => doubleSizeStore.set(!double)}
        style={styles.toggle}
      >
        <Text style={[styles.label, textStyle]}>
          {double ? '☑' : '☐'} Double size ({modifier})
        </Text>
      </Pressable>
      {note && <Text style={[styles.note, textStyle]}>{note}</Text>}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}
      {warnings.map((w, i) => (
        <Text key={i} selectable style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
    </View>
  );
}

/** A skin in the grid: its picture, name and author. */
function SkinCard(props: {
  name: string;
  detail: string;
  /** For skins.preview: an id, a folder, '' for Default; null for none. */
  preview: string | null;
  chosen: boolean;
  error?: string | null;
  onPress?: () => void;
  testID?: string;
  textStyle: object;
  children?: React.ReactNode;
}) {
  const t = usePanelStyles();
  const accent = (t.link as { color?: string }).color ?? colors.accent;
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={!props.onPress}
      style={[
        styles.card,
        t.border,
        props.chosen && [styles.chosen, { borderColor: accent }],
      ]}
    >
      <Preview source={props.preview} width={CARD_W - 12} />
      <Text
        numberOfLines={1}
        style={[
          styles.name,
          props.textStyle,
          props.error != null && styles.muted,
        ]}
      >
        {props.chosen ? '◉ ' : ''}
        {props.name}
      </Text>
      {props.detail !== '' && (
        <Text numberOfLines={1} style={[styles.detail, props.textStyle]}>
          {props.detail}
        </Text>
      )}
      {props.error && (
        <Text numberOfLines={3} style={styles.error}>
          {props.error}
        </Text>
      )}
      {props.children && (
        <View style={styles.cardActions}>{props.children}</View>
      )}
    </Pressable>
  );
}

/**
 * A skin's picture: drawn by the core and cached, so it follows a skin
 * folder as it changes (the path changes with it).
 */
function Preview(props: {
  source: string | null;
  width: number;
  path?: string;
}) {
  const [path, setPath] = useState<string | null>(props.path ?? null);
  const [version, setVersion] = useState(0);
  const { source } = props;
  useEffect(() => {
    if (source === null || props.path) {
      return;
    }
    let live = true;
    skins
      .preview(source)
      .then(p => live && setPath(p))
      .catch(() => live && setPath(null));
    return () => {
      live = false;
    };
  }, [source, version, props.path]);
  // A folder skin changes as its author works on it.
  useEffect(
    () =>
      isFolderSkin(source)
        ? skinStore.subscribe(() => setVersion(v => v + 1))
        : undefined,
    [source],
  );
  const size = useImageSize(path);
  const height = size ? (props.width * size[1]) / size[0] : props.width / 3;
  return path ? (
    <Image
      source={{ uri: fileUri(path) }}
      style={{ width: props.width, height }}
      resizeMode="contain"
    />
  ) : (
    <View style={[styles.noPreview, { width: props.width, height }]} />
  );
}

function useImageSize(path: string | null): [number, number] | null {
  const [size, setSize] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!path) {
      return;
    }
    let live = true;
    Image.getSize(
      fileUri(path),
      (w, h) => live && setSize([w, h]),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [path]);
  return size;
}

/** A .sskin about to be installed: what it is, and Install / Cancel. */
function InstallCard(props: {
  inspection: SkinInspection;
  onInstall: () => void;
  onCancel: () => void;
  textStyle: object;
}) {
  const { inspection: s, textStyle } = props;
  const t = usePanelStyles();
  const replaces = s.installed
    ? `Replaces the installed ${s.installed.name}${
        s.installed.version ? ` ${s.installed.version}` : ''
      }.`
    : null;
  return (
    <View
      testID="install-card"
      style={[styles.card, styles.installCard, t.border]}
    >
      <Text style={[styles.title, textStyle]}>Install this skin?</Text>
      {s.preview && <Preview source={null} path={s.preview} width={360} />}
      <Text style={[styles.name, textStyle]}>
        {s.name}
        {s.version ? ` ${s.version}` : ''}
        {s.author ? ` · ${s.author}` : ''}
      </Text>
      {s.description && (
        <Text style={[styles.detail, textStyle]}>{s.description}</Text>
      )}
      {replaces && <Text style={[styles.detail, textStyle]}>{replaces}</Text>}
      {s.warnings.map((w, i) => (
        <Text key={i} style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
      <View style={styles.cardButtons}>
        <Pressable
          testID="install-confirm"
          onPress={props.onInstall}
          style={[styles.button, t.button]}
        >
          <Text style={[styles.buttonText, t.buttonText]}>
            {s.installed ? 'Replace' : 'Install'}
          </Text>
        </Pressable>
        <Pressable onPress={props.onCancel} style={styles.plainButton}>
          <Text style={[styles.link, t.link]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: CARD_W,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffffff22',
    gap: 3,
  },
  chosen: { borderWidth: 2, padding: 5 },
  installCard: { width: undefined, marginBottom: 12, padding: 10, gap: 6 },
  noPreview: { backgroundColor: '#00000033', borderRadius: 3 },
  title: { fontSize: 14, fontWeight: '600' },
  name: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 11, opacity: 0.75 },
  label: { fontSize: 13 },
  muted: { opacity: 0.5 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 2 },
  cardButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  buttonText: { fontSize: 13, fontWeight: '600', color: '#111' },
  plainButton: { paddingVertical: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    // Windows' text box clips its text without room for its own padding.
    minHeight: 28,
  },
  toggle: { paddingVertical: 4, marginTop: 10 },
  hint: { fontSize: 11, opacity: 0.6, marginTop: 8 },
  link: { color: colors.accent, fontSize: 13 },
  note: { fontSize: 12, marginTop: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
  warning: { fontSize: 11, opacity: 0.7, marginTop: 4 },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { errorText, safeSettings } from './appHelpers';
import {
  displayName,
  formatDate,
  formatDuration,
  formatSize,
} from './libraryModel';
import { editorAvailable } from './native/editor';
import { library, type Recording, type Tags } from './native/SoundScraper';
import { editorTarget, skinsAvailable, windows } from './skin/skins';
import { usePanelStyles } from './panelTheme';
import {
  buildEdit,
  type CoverChange,
  type CoverState,
  type Field,
  FIELD_LABELS,
  fileUri,
  mergeCovers,
  mergeTags,
  TEXT_FIELDS,
  validate,
} from './tagModel';
import { colors } from './theme';

const isWindows = Platform.OS === 'windows';
const REVEAL_LABEL = isWindows ? 'Show in Explorer' : 'Show in Finder';
const TRASH_LABEL = isWindows ? 'Move to Recycle Bin' : 'Move to Trash';
const TRASH_NAME = isWindows ? 'the Recycle Bin' : 'the Trash';

/** A native pop-up menu at (x, y) in the panel; resolves with the index or -1. */
export type ShowMenu = (
  items: string[],
  x: number,
  y: number,
) => Promise<number>;

type Props = {
  /** One recording, or several for a bulk edit. */
  fileNames: string[];
  /** A rename gave the recording a new file name. */
  onRenamed: (oldName: string, newName: string) => void;
  /** Something changed on disk (tags, name, trash). */
  onChanged: () => void;
  onClose: () => void;
  /** The actions menu; without it (no native menus) they show as links. */
  showMenu?: ShowMenu;
  /** Set to a function that opens the actions menu at (x, y) in the window
   * (the panel's title-bar menu button calls it). */
  menuRef?: { current?: (x: number, y: number) => void };
  textStyle: object;
  isDark: boolean;
};

/**
 * Details of the selected recording(s): big cover art (click or drop an
 * image to replace it), the file name and tags edited in place (Enter or
 * leaving a field saves it, Esc cancels), file info, and a gear menu with
 * Show in Finder, cover and trash actions. Several recordings: a bulk edit
 * of their shared tags.
 */
export function DetailsPane(props: Props): React.JSX.Element {
  const { fileNames, textStyle, isDark, onChanged } = props;
  const t = usePanelStyles();
  const [tags, setTags] = useState<Tags[]>();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const single = fileNames.length === 1;
  const key = fileNames.join('\u0000');

  const load = useCallback(async () => {
    const names = key.split('\u0000').filter(Boolean);
    try {
      const [loaded, all] = await Promise.all([
        Promise.all(names.map(n => library.readTags(n))),
        library.list(),
      ]);
      setTags(loaded);
      setRecordings(all.filter(r => names.includes(r.fileName)));
    } catch (e) {
      setError(`Couldn't read the tags: ${errorText(e)}`);
    }
  }, [key]);

  useEffect(() => {
    setTags(undefined);
    setError(undefined);
    load();
  }, [load]);

  const merged = useMemo(() => (tags ? mergeTags(tags) : undefined), [tags]);
  const cover: CoverState = useMemo(
    () => (tags ? mergeCovers(tags) : { kind: 'none' }),
    [tags],
  );

  /** Writes one change to every selected recording, then reloads. */
  const write = async (
    edits: Partial<Record<Field, string>>,
    coverChange: CoverChange,
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      const v23 = safeSettings()?.id3Version === '2.3';
      await library.writeTags(fileNames, buildEdit(edits, coverChange, v23));
      onChanged();
      await load();
    } catch (e) {
      setError(`Couldn't save: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveField = async (field: Field, text: string) => {
    const problem = validate(field, text);
    if (problem) {
      setError(problem);
      return false;
    }
    await write({ [field]: text }, { kind: 'keep' });
    return true;
  };

  const rename = async (text: string) => {
    const old = fileNames[0];
    const recording = recordings.find(r => r.fileName === old);
    if (!text.trim() || (recording && text.trim() === displayName(recording))) {
      return true;
    }
    try {
      const renamed = await library.rename(old, text);
      onChanged();
      props.onRenamed(old, renamed);
      return true;
    } catch (e) {
      setError(`Couldn't rename: ${errorText(e)}`);
      return false;
    }
  };

  const chooseCover = async () => {
    try {
      const path = await library.pickImage();
      if (path) {
        await write({}, { kind: 'set', path });
      }
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onDrop = (e: {
    nativeEvent: { dataTransfer?: { files?: Array<{ uri?: string }> } };
  }) => {
    const uri = e.nativeEvent.dataTransfer?.files?.[0]?.uri;
    const path = uri ? decodeURI(uri.replace(/^file:\/\//, '')) : undefined;
    if (path && /\.(png|jpe?g)$/i.test(path)) {
      write({}, { kind: 'set', path });
    } else if (path) {
      setError('Drop a PNG or JPEG image.');
    }
  };

  const trash = () => {
    const what = !single
      ? `${fileNames.length} recordings`
      : `"${recordings[0] ? displayName(recordings[0]) : fileNames[0]}"`;
    Alert.alert(
      `Move ${what} to ${TRASH_NAME}?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: TRASH_LABEL,
          style: 'destructive',
          onPress: async () => {
            try {
              for (const name of fileNames) {
                await library.trash(name);
              }
              onChanged();
              props.onClose();
            } catch (e) {
              setError(`Couldn't move to ${TRASH_NAME}: ${errorText(e)}`);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const editTrack = () => {
    const r = recordings[0];
    if (!r) {
      return;
    }
    editorTarget.set({
      fileName: r.fileName,
      path: r.path,
      title: displayName(r),
      durationMs: r.durationMs,
    });
    windows.setPanelVisible('editor', true);
  };

  const actions: Array<{ label: string; run: () => void }> = [
    ...(single && editorAvailable && skinsAvailable && recordings[0]
      ? [{ label: 'Edit Track…', run: editTrack }]
      : []),
    ...(single
      ? [{ label: REVEAL_LABEL, run: () => library.reveal(fileNames[0]) }]
      : []),
    { label: 'Change cover…', run: chooseCover },
    ...(cover.kind !== 'none'
      ? [{ label: 'Remove cover', run: () => write({}, { kind: 'remove' }) }]
      : []),
    { label: `${TRASH_LABEL}…`, run: trash },
  ];

  const openMenu = async (x: number, y: number) => {
    if (!props.showMenu) {
      return;
    }
    // A separator before the last (destructive) action.
    const labels = actions.map(a => a.label);
    const last = labels.length - 1;
    const items = [...labels.slice(0, last), '-', labels[last]];
    const chosen = await props.showMenu(items, x, y);
    if (chosen >= 0 && chosen < last) {
      actions[chosen].run();
    } else if (chosen === items.length - 1) {
      actions[last].run();
    }
  };

  if (props.menuRef) {
    props.menuRef.current = openMenu;
  }

  const recording = single ? recordings[0] : undefined;
  // The cover leaves room below it for the file name and title (about
  // 110 points), so they show without scrolling.
  const size = Math.max(
    96,
    Math.min(area.width, area.height > 0 ? area.height - 110 : area.width),
  );
  const dropProps = {
    draggedTypes: ['fileUrl'],
    onDrop,
  } as object;

  return (
    <ScrollView
      style={styles.root}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setArea({ width, height });
      }}
    >
      <View {...dropProps} style={styles.coverBox}>
        <Pressable
          testID="details-cover"
          accessibilityLabel="Cover art. Click to choose an image, or drop one here."
          onPress={chooseCover}
          style={[
            styles.cover,
            { width: size, height: size },
            isDark && styles.coverDark,
            t.border,
          ]}
        >
          {cover.kind === 'image' ? (
            <Image
              source={{ uri: fileUri(cover.path) }}
              style={{ width: size, height: size }}
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.coverText, textStyle, t.cell]}>
              {cover.kind === 'mixed'
                ? 'Mixed covers'
                : 'No cover\nClick or drop an image'}
            </Text>
          )}
        </Pressable>
      </View>

      {busy && <ActivityIndicator style={styles.busy} />}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}

      {!merged ? (
        !error && <ActivityIndicator />
      ) : (
        <View style={styles.fields}>
          {single ? (
            <InlineField
              testID="details-name"
              label="File name"
              value={recording ? displayName(recording) : fileNames[0]}
              onCommit={rename}
              textStyle={textStyle}
              large
            />
          ) : (
            <Text style={[styles.bulk, textStyle]}>
              {fileNames.length} recordings
            </Text>
          )}
          {TEXT_FIELDS.map(field => {
            const m = merged[field];
            return (
              <InlineField
                key={`${key}-${field}`}
                testID={`details-${field}`}
                label={FIELD_LABELS[field]}
                value={m.kind === 'value' ? m.text : ''}
                mixed={m.kind === 'mixed'}
                multiline={field === 'comment'}
                onCommit={text => saveField(field, text)}
                textStyle={textStyle}
              />
            );
          })}
          {recording && (
            <View style={styles.info}>
              <Info
                label="Duration"
                value={formatDuration(recording.durationMs)}
                textStyle={textStyle}
              />
              <Info
                label="Size"
                value={formatSize(recording.sizeBytes)}
                textStyle={textStyle}
              />
              <Info
                label="Recorded"
                value={formatDate(recording.recordedAtMs)}
                textStyle={textStyle}
              />
              <Info
                label="File"
                value={recording.fileName}
                textStyle={textStyle}
              />
            </View>
          )}
          {!props.showMenu && (
            <View style={styles.links}>
              {actions.map(a => (
                <Pressable key={a.label} onPress={a.run}>
                  <Text style={[styles.link, t.link]}>{a.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={props.onClose}>
                <Text style={[styles.link, t.link]}>Close</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * A value shown as text; click to edit in place. Enter (or leaving the
 * field) commits, Esc cancels. `onCommit` resolves false to keep editing.
 */
export function InlineField(props: {
  label: string;
  value: string;
  mixed?: boolean;
  multiline?: boolean;
  large?: boolean;
  onCommit: (text: string) => Promise<boolean>;
  textStyle: object;
  testID?: string;
}): React.JSX.Element {
  const t = usePanelStyles();
  const [editing, setEditing] = useState<string>();
  const commit = async () => {
    if (editing === undefined) {
      return;
    }
    const text = editing;
    if (text === props.value) {
      setEditing(undefined);
      return;
    }
    if (await props.onCommit(text)) {
      setEditing(undefined);
    }
  };
  const valueStyle = [
    styles.value,
    props.large && styles.valueLarge,
    props.textStyle,
    t.cell,
  ];
  return (
    <View style={styles.field}>
      <Text style={[styles.label, props.textStyle, t.cell]}>{props.label}</Text>
      {editing !== undefined ? (
        <TextInput
          testID={`${props.testID}-input`}
          autoFocus
          selectTextOnFocus
          value={editing}
          multiline={props.multiline}
          onChangeText={setEditing}
          onSubmitEditing={commit}
          onBlur={commit}
          onKeyPress={e => {
            if (e.nativeEvent.key === 'Escape') {
              setEditing(undefined);
            }
          }}
          style={[styles.input, valueStyle, t.input]}
        />
      ) : (
        <Pressable
          testID={props.testID}
          accessibilityRole="button"
          accessibilityLabel={`${props.label}: ${
            props.value || 'empty'
          }. Click to edit.`}
          onPress={() => setEditing(props.mixed ? '' : props.value)}
          style={styles.valueBox}
        >
          <Text
            style={[
              valueStyle,
              (props.mixed || !props.value) && styles.placeholder,
            ]}
            numberOfLines={props.multiline ? 4 : 2}
          >
            {props.mixed ? 'Mixed' : props.value || '—'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Info(props: { label: string; value: string; textStyle: object }) {
  const t = usePanelStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, props.textStyle, t.cell]}>
        {props.label}
      </Text>
      <Text
        selectable
        style={[styles.infoValue, props.textStyle, t.cell]}
        numberOfLines={2}
      >
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  coverBox: { alignItems: 'center' },
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
  },
  coverDark: { backgroundColor: '#00000033' },
  coverText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 18,
  },
  busy: { marginTop: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 6 },
  fields: { marginTop: 10 },
  bulk: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  field: { marginBottom: 6 },
  label: { fontSize: 11, opacity: 0.6, marginBottom: 1 },
  valueBox: { minHeight: 18 },
  value: { fontSize: 13 },
  valueLarge: { fontSize: 15, fontWeight: '600' },
  placeholder: { opacity: 0.45 },
  input: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 3,
  },
  info: { marginTop: 8, gap: 2 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 64, fontSize: 11, opacity: 0.6 },
  infoValue: { flex: 1, fontSize: 11 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  link: { color: colors.accent, fontSize: 13 },
});

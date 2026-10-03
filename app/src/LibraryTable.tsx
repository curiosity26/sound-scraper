import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  DEFAULT_SORT,
  displayName,
  filterRecordings,
  formatDate,
  formatDuration,
  formatSize,
  nextSort,
  type Sort,
  type SortKey,
  sortRecordings,
} from './libraryModel';
import type { Recording } from './native/SoundScraper';
import { colors } from './theme';

type Props = {
  recordings: Recording[];
  onRename: (r: Recording, newName: string) => Promise<void>;
  onTrash: (r: Recording) => void;
  onReveal: (r: Recording) => void;
  textStyle: object;
  isDark: boolean;
};

const COLUMNS: { key: SortKey; label: string; flex: number }[] = [
  { key: 'name', label: 'Name', flex: 4 },
  { key: 'duration', label: 'Duration', flex: 1 },
  { key: 'date', label: 'Date recorded', flex: 2 },
  { key: 'size', label: 'Size', flex: 1 },
  { key: 'artist', label: 'Artist / Album', flex: 2 },
];

/** Recordings with sort, search, inline rename, Show in Finder and Trash. */
export function LibraryTable(props: Props): React.JSX.Element {
  const { recordings, textStyle, isDark } = props;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState<{ fileName: string; text: string }>();

  const rows = useMemo(
    () => sortRecordings(filterRecordings(recordings, query), sort),
    [recordings, query, sort],
  );

  const commitRename = async () => {
    if (!editing) {
      return;
    }
    const r = recordings.find(x => x.fileName === editing.fileName);
    setEditing(undefined);
    if (r && editing.text.trim() && editing.text.trim() !== displayName(r)) {
      await props.onRename(r, editing.text);
    }
  };

  const confirmTrash = (r: Recording) =>
    Alert.alert(
      `Move "${displayName(r)}" to the Trash?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to Trash',
          style: 'destructive',
          onPress: () => props.onTrash(r),
        },
      ],
      { cancelable: true },
    );

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={[styles.section, textStyle]}>
          Library{' '}
          <Text style={styles.count}>
            {rows.length === recordings.length
              ? recordings.length
              : `${rows.length} of ${recordings.length}`}
          </Text>
        </Text>
        <TextInput
          testID="library-search"
          style={[styles.search, textStyle, isDark && styles.inputDark]}
          placeholder="Search"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={[styles.row, styles.header]}>
        {COLUMNS.map(c => (
          <Pressable
            key={c.key}
            style={{ flex: c.flex }}
            onPress={() => setSort(s => nextSort(s, c.key))}
          >
            <Text style={[styles.headerText, textStyle]} numberOfLines={1}>
              {c.label}
              {sort.key === c.key ? (sort.ascending ? ' ▲' : ' ▼') : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.fileName}
        ListEmptyComponent={
          <Text style={[styles.empty, textStyle]}>
            {recordings.length === 0
              ? 'No recordings yet. Press Record to make one.'
              : 'No recordings match your search.'}
          </Text>
        }
        renderItem={({ item: r }) => {
          const isSelected = r.fileName === selected;
          const isEditing = editing?.fileName === r.fileName;
          return (
            <View>
              <Pressable
                testID={`recording-${r.fileName}`}
                onPress={() => setSelected(r.fileName)}
                style={[styles.row, isSelected && styles.rowSelected]}
              >
                <View style={{ flex: COLUMNS[0].flex }}>
                  {isEditing ? (
                    <TextInput
                      testID="rename-input"
                      autoFocus
                      selectTextOnFocus
                      style={[
                        styles.renameInput,
                        textStyle,
                        isDark && styles.inputDark,
                      ]}
                      value={editing.text}
                      onChangeText={text =>
                        setEditing({ fileName: r.fileName, text })
                      }
                      onSubmitEditing={commitRename}
                      onKeyPress={e => {
                        if (e.nativeEvent.key === 'Escape') {
                          setEditing(undefined);
                        }
                      }}
                    />
                  ) : (
                    <Text style={[styles.cell, textStyle]} numberOfLines={1}>
                      {displayName(r)}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.cell, textStyle, { flex: COLUMNS[1].flex }]}
                >
                  {formatDuration(r.durationMs)}
                </Text>
                <Text
                  style={[styles.cell, textStyle, { flex: COLUMNS[2].flex }]}
                >
                  {formatDate(r.recordedAtMs)}
                </Text>
                <Text
                  style={[styles.cell, textStyle, { flex: COLUMNS[3].flex }]}
                >
                  {formatSize(r.sizeBytes)}
                </Text>
                <Text
                  style={[
                    styles.cell,
                    styles.dim,
                    textStyle,
                    { flex: COLUMNS[4].flex },
                  ]}
                  numberOfLines={1}
                >
                  {[r.artist, r.album].filter(Boolean).join(' / ') || '—'}
                </Text>
              </Pressable>
              {isSelected && (
                <View style={styles.actions}>
                  {isEditing ? (
                    <>
                      <Action label="Save" onPress={commitRename} />
                      <Action
                        label="Cancel"
                        onPress={() => setEditing(undefined)}
                      />
                    </>
                  ) : (
                    <>
                      <Action
                        testID="rename"
                        label="Rename"
                        onPress={() =>
                          setEditing({
                            fileName: r.fileName,
                            text: displayName(r),
                          })
                        }
                      />
                      <Action
                        label="Show in Finder"
                        onPress={() => props.onReveal(r)}
                      />
                      <Action
                        label="Move to Trash"
                        onPress={() => confirmTrash(r)}
                        destructive
                      />
                    </>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function Action(props: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      style={styles.action}
    >
      <Text
        style={[styles.actionText, props.destructive && styles.destructive]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 24 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  section: { fontSize: 16, fontWeight: '600' },
  count: { fontWeight: '400', opacity: 0.6 },
  search: {
    width: 220,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 6,
  },
  inputDark: { backgroundColor: '#2a2a2a' },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  rowSelected: { backgroundColor: '#2f6fde22' },
  cell: { fontSize: 13 },
  dim: { opacity: 0.7 },
  renameInput: {
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: '#2f6fde22',
  },
  action: { paddingVertical: 2 },
  actionText: { color: colors.accent, fontSize: 13 },
  destructive: { color: colors.error },
  empty: { padding: 16, opacity: 0.6, fontSize: 13 },
});

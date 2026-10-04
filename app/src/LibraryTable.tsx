import React, { useMemo, useRef, useState } from 'react';
import {
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
import { usePanelStyles, usePanelTheme } from './panelTheme';
import { SkinScrollbar } from './skin/SkinScrollbar';
import { colors } from './theme';

type Props = {
  recordings: Recording[];
  /** The row shown in the details panel. */
  selected?: string;
  /** A row was clicked: show it in the details panel. */
  onSelect: (fileName: string) => void;
  /** Opens the details panel for these (checked) recordings. */
  onEditTags: (fileNames: string[]) => void;
  /** Checked rows (multi-select for bulk tag edits). */
  checked: Set<string>;
  onCheckedChange: (checked: Set<string>) => void;
  textStyle: object;
  isDark: boolean;
  /** In a skinned panel: no heading or top margin (the title shows the count). */
  compact?: boolean;
};

/** Columns that fit a table `width` points wide (0 = not measured yet). */
export function visibleColumns(width: number): SortKey[] {
  return COLUMNS.map(c => c.key).filter(
    key =>
      width === 0 ||
      (key === 'artist' ? width >= 620 : key === 'size' ? width >= 470 : true),
  );
}

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
  const t = usePanelStyles();
  const scrollbar = usePanelTheme()?.scrollbar;
  const list = useRef<FlatList<Recording>>(null);
  const [scroll, setScroll] = useState({ viewport: 0, content: 0, offset: 0 });
  const [width, setWidth] = useState(0);
  const shown = visibleColumns(width);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const { selected } = props;

  const rows = useMemo(
    () => sortRecordings(filterRecordings(recordings, query), sort),
    [recordings, query, sort],
  );
  const { checked, onCheckedChange } = props;
  const allChecked =
    rows.length > 0 && rows.every(r => checked.has(r.fileName));
  const toggle = (fileName: string) => {
    const next = new Set(checked);
    if (next.has(fileName)) {
      next.delete(fileName);
    } else {
      next.add(fileName);
    }
    onCheckedChange(next);
  };
  const toggleAll = () =>
    onCheckedChange(
      allChecked ? new Set() : new Set(rows.map(r => r.fileName)),
    );

  return (
    <View
      style={[styles.root, props.compact && styles.rootCompact]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.toolbar}>
        {!props.compact && (
          <Text style={[styles.section, textStyle, t.text]}>
            Library{' '}
            <Text style={styles.count}>
              {rows.length === recordings.length
                ? recordings.length
                : `${rows.length} of ${recordings.length}`}
            </Text>
          </Text>
        )}
        {checked.size > 0 && (
          <Pressable
            testID="edit-checked-tags"
            onPress={() => props.onEditTags([...checked])}
          >
            <Text style={[styles.toolbarLink, t.link, t.cell]}>
              Edit {checked.size} selected
            </Text>
          </Pressable>
        )}
        <TextInput
          testID="library-search"
          style={[
            styles.search,
            textStyle,
            isDark && styles.inputDark,
            t.input,
          ]}
          placeholder="Search"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={[styles.row, t.row, styles.header, t.header]}>
        <Pressable onPress={toggleAll} style={styles.check}>
          <Text style={[styles.checkText, textStyle, t.headerText]}>
            {allChecked ? '☑' : '☐'}
          </Text>
        </Pressable>
        {COLUMNS.filter(c => shown.includes(c.key)).map(c => (
          <Pressable
            key={c.key}
            style={{ flex: c.flex }}
            onPress={() => setSort(s => nextSort(s, c.key))}
          >
            <Text
              style={[styles.headerText, textStyle, t.headerText]}
              numberOfLines={1}
            >
              {c.label}
              {sort.key === c.key ? (sort.ascending ? ' ▲' : ' ▼') : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[styles.listBox, t.table]}
        onLayout={e => {
          const viewport = e.nativeEvent.layout.height;
          setScroll(v => ({ ...v, viewport }));
        }}
      >
        <FlatList
          ref={list}
          data={rows}
          showsVerticalScrollIndicator={!scrollbar}
          style={scrollbar ? { marginRight: scrollbar.track[2] } : undefined}
          onContentSizeChange={(_, content) =>
            setScroll(v => ({ ...v, content }))
          }
          onScroll={e => {
            const offset = e.nativeEvent.contentOffset.y;
            setScroll(v => ({ ...v, offset }));
          }}
          scrollEventThrottle={16}
          keyExtractor={r => r.fileName}
          ListEmptyComponent={
            <Text style={[styles.empty, textStyle, t.tableText]}>
              {recordings.length === 0
                ? 'No recordings yet. Press Record to make one.'
                : 'No recordings match your search.'}
            </Text>
          }
          renderItem={({ item: r, index }) => {
            const isSelected = r.fileName === selected;
            const cellText = [
              t.cell,
              textStyle,
              t.tableText,
              isSelected && t.selectedText,
            ];
            return (
              <Pressable
                testID={`recording-${r.fileName}`}
                onPress={() => props.onSelect(r.fileName)}
                style={[
                  styles.row,
                  t.row,
                  t.grid,
                  index % 2 === 1 && t.rowAlternate,
                  isSelected && styles.rowSelected,
                  isSelected && t.rowSelected,
                ]}
              >
                <Pressable
                  testID={`check-${r.fileName}`}
                  onPress={() => toggle(r.fileName)}
                  style={styles.check}
                >
                  <Text style={[styles.checkText, cellText]}>
                    {checked.has(r.fileName) ? '☑' : '☐'}
                  </Text>
                </Pressable>
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[0].flex }]}
                  numberOfLines={1}
                >
                  {displayName(r)}
                </Text>
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[1].flex }]}
                  numberOfLines={1}
                >
                  {formatDuration(r.durationMs)}
                </Text>
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[2].flex }]}
                  numberOfLines={1}
                >
                  {formatDate(r.recordedAtMs)}
                </Text>
                {shown.includes('size') && (
                  <Text
                    style={[styles.cell, cellText, { flex: COLUMNS[3].flex }]}
                    numberOfLines={1}
                  >
                    {formatSize(r.sizeBytes)}
                  </Text>
                )}
                {shown.includes('artist') && (
                  <Text
                    style={[
                      styles.cell,
                      styles.dim,
                      cellText,
                      { flex: COLUMNS[4].flex },
                    ]}
                    numberOfLines={1}
                  >
                    {[r.artist, r.album].filter(Boolean).join(' / ') || '—'}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
        {scrollbar && (
          <SkinScrollbar
            scrollbar={scrollbar}
            viewport={scroll.viewport}
            content={scroll.content}
            offset={scroll.offset}
            onScrollTo={offset =>
              list.current?.scrollToOffset({ offset, animated: false })
            }
          />
        )}
      </View>
    </View>
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
  toolbarLink: {
    color: colors.accent,
    fontSize: 13,
    marginLeft: 'auto',
    marginRight: 12,
  },
  check: { width: 20 },
  checkText: { fontSize: 14 },
  empty: { padding: 16, opacity: 0.6, fontSize: 13 },
  listBox: { flex: 1 },
  rootCompact: { marginTop: 0 },
});

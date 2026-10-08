import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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
import {
  filterPlaylistRows,
  moveBy,
  moveItems,
  type PlaylistRow,
  rowName,
  sortPlaylistRows,
} from './playlistModel';
import { SkinScrollbar } from './skin/SkinScrollbar';
import { colors } from './theme';
import { TextField } from './TextField';

/** A playlist shown in place of the whole library. */
export type PlaylistView = {
  rows: PlaylistRow[];
  /** The row loaded for playback (a recording can appear twice). */
  playingItemId: number | null;
  /** The row shown in the details panel. */
  selectedItemId: number | null;
  onSelectItem: (row: PlaylistRow) => void;
  /** The new order, every item id. */
  onReorder: (itemIds: number[]) => void;
  onRemove: (itemIds: number[]) => void;
  /** Index (in `rows`) of the first track past an 80-minute CD, or -1. */
  firstOver: number;
};

type Props = {
  recordings: Recording[];
  /** The row shown in the details panel. */
  selected?: string;
  /** The recording loaded for playback (marked ▶). */
  loaded?: string;
  /** A row was clicked: show it in the details panel. */
  onSelect: (fileName: string) => void;
  /** Opens the details panel for these (checked) recordings. */
  onEditTags: (fileNames: string[]) => void;
  /**
   * Checked rows (multi-select for bulk tag edits): file names in the
   * library, `#<item id>` in a playlist (see rowKey).
   */
  checked: Set<string>;
  onCheckedChange: (checked: Set<string>) => void;
  textStyle: object;
  isDark: boolean;
  /** In a skinned panel: no heading or top margin (the title shows the count). */
  compact?: boolean;
  /** Shows a playlist instead of the library. */
  playlist?: PlaylistView;
  /** Leading toolbar content (the playlist picker). */
  toolbarStart?: React.ReactNode;
  /** Toolbar actions shown while rows are checked ("Add to ▾"). */
  checkedActions?: React.ReactNode;
  /** Under the table (the CD capacity bar). */
  footer?: React.ReactNode;
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

/** The key a row is checked under. */
export function rowKey(row: Row): string {
  return row.itemId === undefined ? row.fileName : `#${row.itemId}`;
}

type Row = {
  fileName: string;
  /** Missing from the library (a playlist row whose file is gone). */
  recording?: Recording;
  itemId?: number;
  position?: number;
  name: string;
  /** Index in the playlist's own order. */
  index?: number;
};

const SORT_POSITION: Sort = { key: 'position', ascending: true };

/**
 * Recordings with sort, search, inline rename, Show in Finder and Trash; or
 * a playlist's rows, in its order, with drag handles to reorder them.
 */
export function LibraryTable(props: Props): React.JSX.Element {
  const { recordings, textStyle, isDark, playlist } = props;
  const t = usePanelStyles();
  const theme = usePanelTheme();
  const scrollbar = theme?.scrollbar;
  const pc = theme?.playlist ?? {};
  const list = useRef<FlatList<Row>>(null);
  const [scroll, setScroll] = useState({ viewport: 0, content: 0, offset: 0 });
  const [width, setWidth] = useState(0);
  const shown = visibleColumns(width);
  const [query, setQuery] = useState('');
  const [librarySort, setLibrarySort] = useState<Sort>(DEFAULT_SORT);
  const [playlistSort, setPlaylistSort] = useState<Sort>(SORT_POSITION);
  const sort = playlist ? playlistSort : librarySort;
  const setSort = playlist ? setPlaylistSort : setLibrarySort;
  const { selected } = props;

  const rows: Row[] = useMemo(() => {
    if (playlist) {
      const sorted = sortPlaylistRows(
        filterPlaylistRows(playlist.rows, query),
        sort,
      );
      return sorted.map(r => ({
        fileName: r.item.fileName,
        recording: r.recording,
        itemId: r.item.id,
        position: r.position,
        name: rowName(r),
        index: r.position - 1,
      }));
    }
    return sortRecordings(filterRecordings(recordings, query), sort).map(r => ({
      fileName: r.fileName,
      recording: r,
      name: displayName(r),
    }));
  }, [recordings, playlist, query, sort]);

  const total = playlist ? playlist.rows.length : recordings.length;
  const { checked, onCheckedChange } = props;
  const allChecked = rows.length > 0 && rows.every(r => checked.has(rowKey(r)));
  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onCheckedChange(next);
  };
  const toggleAll = () =>
    onCheckedChange(allChecked ? new Set() : new Set(rows.map(rowKey)));
  const checkedRows = rows.filter(r => checked.has(rowKey(r)));
  const checkedNames = [
    ...new Set(checkedRows.filter(r => r.recording).map(r => r.fileName)),
  ];

  // Reordering: only in the playlist's own order, unfiltered.
  const canReorder =
    playlist !== undefined &&
    sort.key === 'position' &&
    sort.ascending &&
    query.trim() === '';
  const order = playlist?.rows.map(r => r.item.id) ?? [];
  const checkedItemIds = checkedRows
    .map(r => r.itemId)
    .filter((id): id is number => id !== undefined);

  // Dragging a row by its handle: the rows move together (all checked rows,
  // if the dragged one is checked), landing before `drop.target`.
  const rowHeight = useRef(0);
  const [drag, setDrag] = useState<{
    ids: number[];
    from: number;
    target: number;
  } | null>(null);
  const dragStart = useRef(0);
  const beginDrag = (row: Row, pageY: number) => {
    const key = rowKey(row);
    const ids =
      checked.has(key) && checkedItemIds.length > 0
        ? checkedItemIds
        : [row.itemId!];
    dragStart.current = pageY;
    setDrag({ ids, from: row.index!, target: row.index! });
  };
  const moveDrag = (pageY: number) => {
    if (!drag || rowHeight.current <= 0) {
      return;
    }
    const delta = (pageY - dragStart.current) / rowHeight.current;
    // Moving down lands after the row under the pointer.
    const raw = drag.from + Math.round(delta) + (delta > 0 ? 1 : 0);
    const target = Math.max(0, Math.min(order.length, raw));
    if (target !== drag.target) {
      setDrag({ ...drag, target });
    }
  };
  const endDrag = () => {
    if (drag && playlist) {
      const next = moveItems(order, drag.ids, drag.target);
      if (next.some((id, i) => id !== order[i])) {
        playlist.onReorder(next);
      }
    }
    setDrag(null);
  };

  const columns = COLUMNS.filter(c => shown.includes(c.key));
  const accent = theme?.accent ?? colors.accent;

  return (
    <View
      style={[styles.root, props.compact && styles.rootCompact]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.toolbar}>
        {props.toolbarStart}
        {!props.compact && !props.toolbarStart && (
          <Text style={[styles.section, textStyle, t.text]}>
            Library{' '}
            <Text style={styles.count}>
              {rows.length === total ? total : `${rows.length} of ${total}`}
            </Text>
          </Text>
        )}
        <View style={styles.actions}>
          {checkedNames.length > 0 && (
            <Pressable
              testID="edit-checked-tags"
              onPress={() => props.onEditTags(checkedNames)}
            >
              <Text style={[styles.toolbarLink, t.link, t.cell]}>
                Edit {checkedNames.length} selected
              </Text>
            </Pressable>
          )}
          {checked.size > 0 && props.checkedActions}
          {playlist && checkedItemIds.length > 0 && (
            <>
              <Pressable
                testID="playlist-remove"
                onPress={() => {
                  playlist.onRemove(checkedItemIds);
                  onCheckedChange(new Set());
                }}
              >
                <Text style={[styles.toolbarLink, t.link, t.cell]}>Remove</Text>
              </Pressable>
              {canReorder && (
                <>
                  <Pressable
                    testID="playlist-move-up"
                    accessibilityLabel="Move up"
                    onPress={() =>
                      playlist.onReorder(moveBy(order, checkedItemIds, -1))
                    }
                  >
                    <Text style={[styles.toolbarLink, t.link, t.cell]}>▲</Text>
                  </Pressable>
                  <Pressable
                    testID="playlist-move-down"
                    accessibilityLabel="Move down"
                    onPress={() =>
                      playlist.onReorder(moveBy(order, checkedItemIds, 1))
                    }
                  >
                    <Text style={[styles.toolbarLink, t.link, t.cell]}>▼</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>
        <TextField
          testID="library-search"
          style={[
            styles.search,
            props.toolbarStart ? styles.searchNarrow : null,
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
        {playlist && <View style={styles.handle} />}
        <Pressable onPress={toggleAll} style={styles.check}>
          <Text style={[styles.checkText, textStyle, t.headerText]}>
            {allChecked ? '☑' : '☐'}
          </Text>
        </Pressable>
        {playlist && (
          <Pressable
            style={styles.position}
            onPress={() => setSort(s => nextSort(s, 'position'))}
          >
            <Text
              style={[styles.headerText, textStyle, t.headerText]}
              numberOfLines={1}
            >
              #{sort.key === 'position' ? (sort.ascending ? '▲' : '▼') : ''}
            </Text>
          </Pressable>
        )}
        {columns.map(c => (
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
          scrollEnabled={drag === null}
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
          keyExtractor={rowKey}
          ListEmptyComponent={
            <Text style={[styles.empty, textStyle, t.tableText]}>
              {playlist
                ? total === 0
                  ? 'This playlist is empty. Choose + Add Recordings… above, or record while it is showing.'
                  : 'Nothing in this playlist matches your search.'
                : recordings.length === 0
                ? 'No recordings yet. Press Record to make one.'
                : 'No recordings match your search.'}
            </Text>
          }
          renderItem={({ item: row, index }) => {
            const r = row.recording;
            const isSelected = playlist
              ? row.itemId === playlist.selectedItemId
              : row.fileName === selected;
            const isLoaded = playlist
              ? row.itemId === playlist.playingItemId ||
                (playlist.playingItemId === null &&
                  row.fileName === props.loaded)
              : row.fileName === props.loaded;
            const isOver =
              playlist !== undefined &&
              playlist.firstOver >= 0 &&
              row.index !== undefined &&
              row.index >= playlist.firstOver;
            const cellText = [
              t.cell,
              textStyle,
              t.tableText,
              isSelected && t.selectedText,
              !r && {
                color: pc.missing ?? '#888',
                fontStyle: 'italic' as const,
              },
            ];
            const key = rowKey(row);
            return (
              <Pressable
                testID={`recording-${key}`}
                onLayout={
                  index === 0
                    ? e => {
                        rowHeight.current = e.nativeEvent.layout.height;
                      }
                    : undefined
                }
                onPress={() => {
                  if (!r) {
                    return;
                  }
                  if (playlist) {
                    const source = playlist.rows.find(
                      p => p.item.id === row.itemId,
                    );
                    source && playlist.onSelectItem(source);
                  } else {
                    props.onSelect(row.fileName);
                  }
                }}
                style={[
                  styles.row,
                  t.row,
                  t.grid,
                  index % 2 === 1 && t.rowAlternate,
                  isSelected && styles.rowSelected,
                  isSelected && t.rowSelected,
                  isOver && [
                    styles.over,
                    { borderLeftColor: pc.over ?? colors.error },
                  ],
                ]}
              >
                {playlist && (
                  <View
                    testID={`handle-${key}`}
                    style={styles.handle}
                    onStartShouldSetResponder={() => canReorder}
                    onMoveShouldSetResponder={() => canReorder}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={e => beginDrag(row, e.nativeEvent.pageY)}
                    onResponderMove={e => moveDrag(e.nativeEvent.pageY)}
                    onResponderRelease={endDrag}
                    onResponderTerminate={endDrag}
                  >
                    {canReorder && (
                      <Text
                        style={[
                          styles.handleText,
                          { color: pc.handle ?? '#888' },
                        ]}
                      >
                        ≡
                      </Text>
                    )}
                  </View>
                )}
                <Pressable
                  testID={`check-${key}`}
                  onPress={() => toggle(key)}
                  style={styles.check}
                >
                  <Text style={[styles.checkText, cellText]}>
                    {checked.has(key) ? '☑' : '☐'}
                  </Text>
                </Pressable>
                {playlist && (
                  <Text
                    style={[styles.cell, styles.position, cellText]}
                    numberOfLines={1}
                  >
                    {row.position}
                  </Text>
                )}
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[0].flex }]}
                  numberOfLines={1}
                >
                  {isLoaded ? '▶ ' : ''}
                  {row.name}
                </Text>
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[1].flex }]}
                  numberOfLines={1}
                >
                  {r ? formatDuration(r.durationMs) : 'missing'}
                </Text>
                <Text
                  style={[styles.cell, cellText, { flex: COLUMNS[2].flex }]}
                  numberOfLines={1}
                >
                  {r ? formatDate(r.recordedAtMs) : ''}
                </Text>
                {shown.includes('size') && (
                  <Text
                    style={[styles.cell, cellText, { flex: COLUMNS[3].flex }]}
                    numberOfLines={1}
                  >
                    {r ? formatSize(r.sizeBytes) : ''}
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
                    {r
                      ? [r.artist, r.album].filter(Boolean).join(' / ') || '—'
                      : ''}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
        {drag && rowHeight.current > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.insert,
              {
                top: drag.target * rowHeight.current - scroll.offset - 1,
                backgroundColor: pc.insert ?? accent,
              },
            ]}
          />
        )}
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
      {props.footer}
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
    gap: 8,
  },
  actions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
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
  searchNarrow: { width: 150 },
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
  },
  check: { width: 20 },
  checkText: { fontSize: 14 },
  position: { width: 26, textAlign: 'right' },
  handle: {
    width: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  handleText: { fontSize: 14, lineHeight: 16 },
  insert: { position: 'absolute', left: 0, right: 0, height: 2 },
  over: { borderLeftWidth: 3 },
  empty: { padding: 16, opacity: 0.6, fontSize: 13 },
  listBox: { flex: 1 },
  rootCompact: { marginTop: 0 },
});

import React, { type FC, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import type { RowTarget } from '@/components/LibraryScreen/types'
import { TextField } from '@/components/TextField'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { COLUMNS } from '@/library/constants'
import type { PlaylistView, Row } from '@/library/types'
import type { Recording } from '@/native/types'
import { colors } from '@/theme/colors'

import { LibraryRow } from './LibraryRow'
import { moveBy } from './moveBy'
import { rowKey } from './rowKey'
import { rowStyles } from './rowStyles'
import { SkinScrollbar } from './SkinScrollbar'
import type { MouseLike } from './types'
import { useCheckBoxes } from './useCheckBoxes'
import { useLibraryRows } from './useLibraryRows'
import { usePlaylistDrag } from './usePlaylistDrag'
import { visibleColumns } from './visibleColumns'

export type LibraryTableProps = {
  readonly recordings: readonly Recording[]
  /** The row shown in the details panel. */
  readonly selected?: string
  /** The recording loaded for playback (marked ▶). */
  readonly loaded?: string
  /** A row was clicked: show it in the details panel. */
  readonly onSelect: (fileName: string) => void
  /** Opens the details panel for these (checked) recordings. */
  readonly onEditTags: (fileNames: string[]) => void
  /**
   * Checked rows (multi-select for bulk tag edits): file names in the
   * library, `#<item id>` in a playlist (see rowKey).
   */
  readonly checked: Set<string>
  readonly onCheckedChange: (checked: Set<string>) => void
  readonly textStyle: object
  readonly isDark: boolean
  /** In a skinned panel: no heading or top margin (the title shows the count). */
  readonly compact?: boolean
  /** Shows a playlist instead of the library. */
  readonly playlist?: PlaylistView
  /** Leading toolbar content (the playlist picker). */
  readonly toolbarStart?: React.ReactNode
  /** Toolbar actions shown while rows are checked ("Add to ▾"). */
  readonly checkedActions?: React.ReactNode
  /** Under the table (the CD capacity bar). */
  readonly footer?: React.ReactNode
  /**
   * A row was right-clicked at (x, y) in the window: its file name, and its
   * item id in a playlist.
   */
  readonly onContextMenu?: (target: RowTarget, x: number, y: number) => void
}

/**
 * Recordings with sort, search, inline rename, Show in Finder and Trash; or
 * a playlist's rows, in its order, with drag handles to reorder them.
 */
export const LibraryTable: FC<LibraryTableProps> = props => {
  const { recordings, textStyle, isDark, playlist, checked, onCheckedChange } =
    props
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const scrollbar = theme?.scrollbar
  const pc = theme?.playlist ?? {}
  const list = useRef<FlatList<Row>>(null)
  const [scroll, setScroll] = useState({ viewport: 0, content: 0, offset: 0 })
  const [width, setWidth] = useState(0)
  const shown = visibleColumns(width)
  const { query, setQuery, sort, toggleSort, rows, total, canReorder, order } =
    useLibraryRows({ recordings, playlist })
  const checks = useCheckBoxes({ rows, checked, onCheckedChange })
  const { checkedNames, checkedItemIds } = checks
  const drag = usePlaylistDrag({
    rows,
    playlist,
    order,
    canReorder,
    checked,
    checkedItemIds,
    scrollOffset: scroll.offset,
  })

  // Right-click: the same menu as the details panel's gear. Both the press
  // and (on Windows) the pointer event may report it; show the menu once.
  const lastMenu = useRef(0)
  const rightClick = (row: Row, e: MouseLike) => {
    if (e.button !== 2 || !props.onContextMenu) {
      return
    }
    if (Date.now() - lastMenu.current < 600) {
      return
    }
    lastMenu.current = Date.now()
    props.onContextMenu(
      { fileName: row.fileName, itemId: row.itemId, key: rowKey(row) },
      e.pageX ?? 0,
      e.pageY ?? 0,
    )
  }

  const columns = COLUMNS.filter(c => shown.includes(c.key))
  const accent = theme?.accent ?? colors.accent

  return (
    <View
      style={[styles.root, props.compact && styles.rootCompact]}
      onLayout={e => {
        setWidth(e.nativeEvent.layout.width)
      }}
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
              onPress={() => {
                props.onEditTags(checkedNames)
              }}
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
                  playlist.onRemove(checkedItemIds)
                  onCheckedChange(new Set())
                }}
              >
                <Text style={[styles.toolbarLink, t.link, t.cell]}>Remove</Text>
              </Pressable>
              {canReorder && (
                <>
                  <Pressable
                    testID="playlist-move-up"
                    accessibilityLabel="Move up"
                    onPress={() => {
                      playlist.onReorder(moveBy(order, checkedItemIds, -1))
                    }}
                  >
                    <Text style={[styles.toolbarLink, t.link, t.cell]}>▲</Text>
                  </Pressable>
                  <Pressable
                    testID="playlist-move-down"
                    accessibilityLabel="Move down"
                    onPress={() => {
                      playlist.onReorder(moveBy(order, checkedItemIds, 1))
                    }}
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

      <View style={[rowStyles.row, t.row, styles.header, t.header]}>
        {playlist && <View style={rowStyles.handle} />}
        <Pressable onPress={checks.toggleAll} style={rowStyles.check}>
          <Text style={[rowStyles.checkText, textStyle, t.headerText]}>
            {checks.allChecked ? '☑' : '☐'}
          </Text>
        </Pressable>
        {playlist && (
          <Pressable
            style={rowStyles.position}
            onPress={() => {
              toggleSort('position')
            }}
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
            onPress={() => {
              toggleSort(c.key)
            }}
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
        ref={drag.box}
        style={[styles.listBox, t.table]}
        onLayout={e => {
          const viewport = e.nativeEvent.layout.height
          setScroll(v => ({ ...v, viewport }))
          drag.measureBox()
        }}
        onStartShouldSetResponderCapture={drag.startCapture}
        onResponderTerminationRequest={() => false}
        onResponderGrant={drag.begin}
        onResponderMove={drag.move}
        onResponderRelease={drag.end}
        onResponderTerminate={drag.end}
      >
        <FlatList
          ref={list}
          data={rows}
          scrollEnabled={drag.drag === null}
          showsVerticalScrollIndicator={!scrollbar}
          style={scrollbar ? { marginRight: scrollbar.track[2] } : undefined}
          onContentSizeChange={(_, content) => {
            setScroll(v => ({ ...v, content }))
          }}
          onScroll={e => {
            const offset = e.nativeEvent.contentOffset.y
            setScroll(v => ({ ...v, offset }))
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
          renderItem={({ item: row, index }) => (
            <LibraryRow
              row={row}
              index={index}
              playlist={playlist}
              selected={props.selected}
              loaded={props.loaded}
              checked={checked.has(rowKey(row))}
              canReorder={canReorder}
              shown={shown}
              textStyle={textStyle}
              onLayout={
                index === 0
                  ? e => {
                      drag.rowHeight.current = e.nativeEvent.layout.height
                    }
                  : undefined
              }
              onRightClick={e => {
                rightClick(row, e)
              }}
              onAuxClick={e => {
                rightClick(row, {
                  button: e.button ?? 2,
                  pageX: drag.boxAt.current.x + (e.clientX ?? 0),
                  pageY:
                    drag.boxAt.current.y +
                    index * drag.rowHeight.current -
                    scroll.offset +
                    (e.clientY ?? 0),
                })
              }}
              onPress={() => {
                if (!row.recording || Date.now() - lastMenu.current < 600) {
                  return
                }
                if (playlist) {
                  const source = playlist.rows.find(
                    p => p.item.id === row.itemId,
                  )
                  if (source) {
                    playlist.onSelectItem(source)
                  }
                } else {
                  props.onSelect(row.fileName)
                }
              }}
              onToggle={() => {
                checks.toggle(rowKey(row))
              }}
            />
          )}
        />
        {drag.drag && drag.rowHeight.current > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.insert,
              {
                top:
                  drag.drag.target * drag.rowHeight.current - scroll.offset - 1,
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
  )
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
  toolbarLink: {
    color: colors.accent,
    fontSize: 13,
  },
  insert: { position: 'absolute', left: 0, right: 0, height: 2 },
  empty: { padding: 16, opacity: 0.6, fontSize: 13 },
  listBox: { flex: 1 },
  rootCompact: { marginTop: 0 },
})

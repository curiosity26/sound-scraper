import React, { type FC } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { COLUMNS } from '@/library/constants'
import { formatDate } from '@/library/formatDate'
import { formatDuration } from '@/library/formatDuration'
import { formatSize } from '@/library/formatSize'
import type { Row, SortKey } from '@/library/types'
import { colors } from '@/theme/colors'

import { rowKey } from './rowKey'
import { rowStyles } from './rowStyles'
import type { AuxClick, MouseLike } from './types'

/** One recording (or playlist row) in the table. */
export type LibraryRowProps = {
  readonly row: Row
  readonly index: number
  /** The row shown in the details panel. */
  readonly selected: string | undefined
  /** The recording loaded for playback (marked ▶). */
  readonly loaded: string | undefined
  readonly checked: boolean
  /** Shows the ≡ drag handle. */
  readonly canReorder: boolean
  /** The columns that fit. */
  readonly shown: readonly SortKey[]
  readonly onLayout?: (e: LayoutChangeEvent) => void
  /** A press or pointer event, which may be a right-click. */
  readonly onRightClick: (e: MouseLike) => void
  readonly onAuxClick: (e: AuxClick) => void
  readonly onPress: () => void
  readonly onToggle: () => void
}

export const LibraryRow: FC<LibraryRowProps> = props => {
  const { row, index, shown } = props
  const { textStyle } = useLibraryScreen()
  // Shows a playlist instead of the library.
  const playlist = useLibraryView().shown.view
  const t = usePanelStyles()
  const pc = usePanelTheme()?.playlist ?? {}
  const r = row.recording
  const isSelected = playlist
    ? row.itemId === playlist.selectedItemId
    : row.fileName === props.selected
  const isLoaded = playlist
    ? row.itemId === playlist.playingItemId ||
      (playlist.playingItemId === null && row.fileName === props.loaded)
    : row.fileName === props.loaded
  const isOver =
    playlist !== undefined &&
    playlist.firstOver >= 0 &&
    row.index !== undefined &&
    row.index >= playlist.firstOver
  const cellText = [
    t.cell,
    textStyle,
    t.tableText,
    isSelected && t.selectedText,
    !r && {
      color: pc.missing ?? '#888',
      fontStyle: 'italic' as const,
    },
  ]
  const key = rowKey(row)
  return (
    <Pressable
      testID={`recording-${key}`}
      onLayout={props.onLayout}
      onPressIn={e => {
        props.onRightClick(e.nativeEvent)
      }}
      {...{
        // Windows reports the button on pointer events.
        onPointerDown: (e: { nativeEvent: MouseLike }) => {
          props.onRightClick(e.nativeEvent)
        },
        // macOS: a right-click is an "aux click", with the point
        // in the row's own coordinates.
        onAuxClick: (e: { nativeEvent: AuxClick }) => {
          props.onAuxClick(e.nativeEvent)
        },
      }}
      onPress={props.onPress}
      style={[
        rowStyles.row,
        t.row,
        t.grid,
        index % 2 === 1 && t.rowAlternate,
        isSelected && styles.rowSelected,
        isSelected && t.rowSelected,
        isOver && [styles.over, { borderLeftColor: pc.over ?? colors.error }],
      ]}
    >
      {playlist && (
        <View
          testID={`handle-${key}`}
          style={rowStyles.handle}
          pointerEvents="none"
        >
          {props.canReorder && (
            <Text style={[styles.handleText, { color: pc.handle ?? '#888' }]}>
              ≡
            </Text>
          )}
        </View>
      )}
      <Pressable
        testID={`check-${key}`}
        onPress={props.onToggle}
        style={rowStyles.check}
      >
        <Text style={[rowStyles.checkText, cellText]}>
          {props.checked ? '☑' : '☐'}
        </Text>
      </Pressable>
      {playlist && (
        <Text
          style={[styles.cell, rowStyles.position, cellText]}
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
          style={[styles.cell, styles.dim, cellText, { flex: COLUMNS[4].flex }]}
          numberOfLines={1}
        >
          {r ? [r.artist, r.album].filter(Boolean).join(' / ') || '—' : ''}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowSelected: { backgroundColor: '#2f6fde22' },
  cell: { fontSize: 13 },
  dim: { opacity: 0.7 },
  handleText: { fontSize: 14, lineHeight: 16 },
  over: { borderLeftWidth: 3 },
})

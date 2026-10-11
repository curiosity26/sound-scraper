import React, { type FC } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { rowKey } from '@/components/LibraryScreen/LibraryBody/LibraryTable/rowKey'
import type {
  AuxClick,
  MouseLike,
} from '@/components/LibraryScreen/LibraryBody/LibraryTable/RowList/types'
import { rowStyles } from '@/components/LibraryScreen/LibraryBody/LibraryTable/rowStyles'
import { useLibraryTable } from '@/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { COLUMNS } from '@/library/constants'
import { formatDate } from '@/library/formatDate'
import { formatDuration } from '@/library/formatDuration'
import { formatSize } from '@/library/formatSize'
import type { Row } from '@/library/types'
import { colors } from '@/theme/colors'

import { RowCell } from './RowCell'
import { useRowMarks } from './useRowMarks'

/** One recording (or playlist row) in the table. */
export type LibraryRowProps = {
  readonly row: Row
  readonly index: number
  readonly onLayout?: (e: LayoutChangeEvent) => void
  /** A press or pointer event, which may be a right-click. */
  readonly onRightClick: (e: MouseLike) => void
  readonly onAuxClick: (e: AuxClick) => void
  readonly onPress: () => void
}

export const LibraryRow: FC<LibraryRowProps> = props => {
  const { row, index } = props
  const { textStyle } = useLibraryScreen()
  const { shown, checks: checkedRows } = useLibraryView()
  // Shows a playlist instead of the library.
  const playlist = shown.view
  const { checks, canReorder, columnsShown } = useLibraryTable()
  const { isSelected, isLoaded, isOver } = useRowMarks(row)
  const t = usePanelStyles()
  const pc = usePanelTheme()?.playlist ?? {}
  const r = row.recording
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
          {canReorder && (
            <Text style={[styles.handleText, { color: pc.handle ?? '#888' }]}>
              ≡
            </Text>
          )}
        </View>
      )}
      <Pressable
        testID={`check-${key}`}
        onPress={() => {
          checks.toggle(key)
        }}
        style={rowStyles.check}
      >
        <Text style={[rowStyles.checkText, cellText]}>
          {checkedRows.checked.has(key) ? '☑' : '☐'}
        </Text>
      </Pressable>
      {playlist && (
        <RowCell textStyle={cellText} style={rowStyles.position}>
          {row.position}
        </RowCell>
      )}
      <RowCell textStyle={cellText} flex={COLUMNS[0].flex}>
        {isLoaded ? '▶ ' : ''}
        {row.name}
      </RowCell>
      <RowCell textStyle={cellText} flex={COLUMNS[1].flex}>
        {r ? formatDuration(r.durationMs) : 'missing'}
      </RowCell>
      <RowCell textStyle={cellText} flex={COLUMNS[2].flex}>
        {r ? formatDate(r.recordedAtMs) : ''}
      </RowCell>
      {columnsShown.includes('size') && (
        <RowCell textStyle={cellText} flex={COLUMNS[3].flex}>
          {r ? formatSize(r.sizeBytes) : ''}
        </RowCell>
      )}
      {columnsShown.includes('artist') && (
        <RowCell textStyle={cellText} flex={COLUMNS[4].flex} style={styles.dim}>
          {r ? [r.artist, r.album].filter(Boolean).join(' / ') || '—' : ''}
        </RowCell>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowSelected: { backgroundColor: '#2f6fde22' },
  dim: { opacity: 0.7 },
  handleText: { fontSize: 14, lineHeight: 16 },
  over: { borderLeftWidth: 3 },
})

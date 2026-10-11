import React, { type FC, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'

import { LibraryTableContext } from './LibraryTableContext'
import { RowList } from './RowList'
import { TableHeader } from './TableHeader'
import { TableToolbar } from './TableToolbar'
import { useCheckBoxes } from './useCheckBoxes'
import { useLibraryRows } from './useLibraryRows'
import { visibleColumns } from './visibleColumns'

export type LibraryTableProps = {
  /** Leading toolbar content (the playlist picker). */
  readonly toolbarStart?: React.ReactNode
  /** Toolbar actions shown while rows are checked ("Add to ▾"). */
  readonly checkedActions?: React.ReactNode
  /** Under the table (the CD capacity bar). */
  readonly footer?: React.ReactNode
}

/**
 * Recordings with sort, search, inline rename, Show in Finder and Trash; or
 * a playlist's rows, in its order, with drag handles to reorder them.
 * In a skinned panel (`compact`): no heading or top margin (the title shows
 * the count). Checked rows (multi-select for bulk tag edits) are file names
 * in the library, `#<item id>` in a playlist (see rowKey). Its parts share
 * the rows, search, sort and check boxes through LibraryTableContext.
 */
export const LibraryTable: FC<LibraryTableProps> = props => {
  const { compact } = useLibraryScreen()
  const { recordings, shown, checks: checkedRows } = useLibraryView()
  const [width, setWidth] = useState(0)
  const rows = useLibraryRows({ recordings, playlist: shown.view })
  const checks = useCheckBoxes({
    rows: rows.rows,
    checked: checkedRows.checked,
    onCheckedChange: checkedRows.setChecked,
  })

  return (
    <LibraryTableContext
      value={{ ...rows, checks, columnsShown: visibleColumns(width) }}
    >
      <View
        style={[styles.root, compact && styles.rootCompact]}
        onLayout={e => {
          setWidth(e.nativeEvent.layout.width)
        }}
      >
        <TableToolbar
          start={props.toolbarStart}
          checkedActions={props.checkedActions}
        />
        <TableHeader />
        <RowList />
        {props.footer}
      </View>
    </LibraryTableContext>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 24 },
  rootCompact: { marginTop: 0 },
})

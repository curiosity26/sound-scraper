import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { TextField } from '@/shared/components/TextField'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'

import { EditCheckedLink } from './EditCheckedLink'
import { LibraryHeading } from './LibraryHeading'
import { PlaylistItemActions } from './PlaylistItemActions'

export type TableToolbarProps = {
  /** Leading content (the playlist picker); without it, the heading. */
  readonly start?: React.ReactNode
  /** Actions shown while rows are checked ("Add to ▾"). */
  readonly checkedActions?: React.ReactNode
}

/** Above the table: the heading or playlist picker, the actions for the
 * checked rows, and the search. */
export const TableToolbar: FC<TableToolbarProps> = props => {
  const { textStyle, isDark, compact } = useLibraryScreen()
  const { checked } = useLibraryView().checks
  const { query, setQuery } = useLibraryTable()
  const t = usePanelStyles()
  return (
    <View style={styles.toolbar}>
      {props.start}
      {!compact && !props.start && <LibraryHeading />}
      <View style={styles.actions}>
        <EditCheckedLink />
        {checked.size > 0 && props.checkedActions}
        <PlaylistItemActions />
      </View>
      <TextField
        style={[
          styles.search,
          props.start ? styles.searchNarrow : null,
          textStyle,
          isDark && styles.inputDark,
          t.input,
        ]}
        placeholder="Search"
        value={query}
        onChangeText={setQuery}
      />
    </View>
  )
}

const styles = StyleSheet.create({
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
})

import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { rowStyles } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/rowStyles'
import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { COLUMNS } from '@/features/library/constants'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'

import { SortHeaderCell } from './SortHeaderCell'

/** The column headings (press to sort) with the check-all box, lined up
 * with the rows. */
export const TableHeader: FC = () => {
  const { textStyle } = useLibraryScreen()
  const playlist = useLibraryView().shown.view
  const { checks, columnsShown } = useLibraryTable()
  const t = usePanelStyles()
  return (
    <View style={[rowStyles.row, t.row, styles.header, t.header]}>
      {playlist && <View style={rowStyles.handle} />}
      <Pressable onPress={checks.toggleAll} style={rowStyles.check}>
        <Text style={[rowStyles.checkText, textStyle, t.headerText]}>
          {checks.allChecked ? '☑' : '☐'}
        </Text>
      </Pressable>
      {playlist && (
        <SortHeaderCell
          sortKey="position"
          label="#"
          gap=""
          style={rowStyles.position}
        />
      )}
      {COLUMNS.filter(c => columnsShown.includes(c.key)).map(c => (
        <SortHeaderCell
          key={c.key}
          sortKey={c.key}
          label={c.label}
          style={{ flex: c.flex }}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
})

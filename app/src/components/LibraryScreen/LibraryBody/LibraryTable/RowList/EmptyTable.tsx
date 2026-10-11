import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useLibraryTable } from '@/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/hooks/usePanelStyles'

/** In place of the rows when there are none: why, and what to do. */
export const EmptyTable: FC = () => {
  const { textStyle } = useLibraryScreen()
  const { recordings, shown } = useLibraryView()
  const { total } = useLibraryTable()
  const t = usePanelStyles()
  return (
    <Text style={[styles.empty, textStyle, t.tableText]}>
      {shown.view
        ? total === 0
          ? 'This playlist is empty. Choose + Add Recordings… above, or record while it is showing.'
          : 'Nothing in this playlist matches your search.'
        : recordings.length === 0
        ? 'No recordings yet. Press Record to make one.'
        : 'No recordings match your search.'}
    </Text>
  )
}

const styles = StyleSheet.create({
  empty: { padding: 16, opacity: 0.6, fontSize: 13 },
})

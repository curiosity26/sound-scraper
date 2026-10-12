import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

/** "Library" with the count shown (or "n of total" while searching). */
export const LibraryHeading: FC = () => {
  const { textStyle } = useLibraryScreen()
  const { rows, total } = useLibraryTable()
  const t = usePanelStyles()
  return (
    <Text style={[styles.section, textStyle, t.text]}>
      Library{' '}
      <Text style={styles.count}>
        {rows.length === total
          ? total
          : `${String(rows.length)} of ${String(total)}`}
      </Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  section: { fontSize: 16, fontWeight: '600' },
  count: { fontWeight: '400', opacity: 0.6 },
})

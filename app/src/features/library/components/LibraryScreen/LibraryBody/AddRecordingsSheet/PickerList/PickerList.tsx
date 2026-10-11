import type { FC } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { useRecordingPicker } from '@/features/library/components/LibraryScreen/LibraryBody/AddRecordingsSheet/useRecordingPicker'
import { useDialogColors } from '@/features/library/components/LibraryScreen/LibraryBody/useDialogColors'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

import { PickerRow } from './PickerRow'

/** The library, searched, to click recordings in and out of the choice. */
export const PickerList: FC = () => {
  const t = usePanelStyles()
  const { dim, border } = useDialogColors()
  const { recordings } = useLibraryView()
  const { rows } = useRecordingPicker()
  return (
    <View style={[styles.list, { borderColor: border }, t.table]}>
      <FlatList
        data={rows}
        keyExtractor={r => r.fileName}
        ListEmptyComponent={
          <Text style={[styles.empty, dim]}>
            {recordings.length === 0
              ? 'No recordings yet.'
              : 'No recordings match your search.'}
          </Text>
        }
        renderItem={({ item, index }) => (
          <PickerRow recording={item} index={index} />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  empty: { padding: 12, fontSize: 13 },
})

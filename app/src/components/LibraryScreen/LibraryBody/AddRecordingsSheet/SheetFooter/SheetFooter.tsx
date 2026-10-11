import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useRecordingPicker } from '@/components/LibraryScreen/LibraryBody/AddRecordingsSheet/useRecordingPicker'
import { useDialogColors } from '@/components/LibraryScreen/LibraryBody/useDialogColors'
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { formatDuration } from '@/library/formatDuration'

import { SheetButton } from './SheetButton'

export type SheetFooterProps = {
  /** Cancel, or after adding. */
  readonly onClose: () => void
}

/** How many are chosen and their length, with Cancel and Add. */
export const SheetFooter: FC<SheetFooterProps> = props => {
  const { dim } = useDialogColors()
  const { shown } = useLibraryView()
  const { picked, pickedMs } = useRecordingPicker()
  return (
    <View style={styles.footer}>
      <Text style={[styles.count, dim]}>
        {picked.length === 0
          ? 'Click recordings to choose them.'
          : `${picked.length} chosen · ${formatDuration(pickedMs)}`}
      </Text>
      <SheetButton
        id="add-recordings-cancel"
        label="Cancel"
        onPress={props.onClose}
      />
      <SheetButton
        id="add-recordings-add"
        label={picked.length > 1 ? `Add ${picked.length}` : 'Add'}
        accent
        disabled={picked.length === 0}
        onPress={() => {
          props.onClose()
          shown.addRecordings(picked)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { flex: 1, fontSize: 12 },
})

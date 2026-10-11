// "+ Add Recordings…" in a playlist: an in-panel sheet listing the library
// with check boxes and search, to add recordings without leaving the
// playlist.
import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useDialogColors } from '@/features/library/components/LibraryScreen/LibraryBody/useDialogColors'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { TextField } from '@/shared/components/TextField'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

import { PickerList } from './PickerList'
import { RecordingPickerContext } from './RecordingPickerContext'
import { SheetFooter } from './SheetFooter'
import { useRecordingPickerState } from './useRecordingPickerState'

export type AddRecordingsSheetProps = {
  /** Cancel, or Add (the recordings go into the playlist showing). */
  readonly onClose: () => void
}

/** Its list and footer share the search and the choices through
 * RecordingPickerContext. */
export const AddRecordingsSheet: FC<AddRecordingsSheetProps> = props => {
  const t = usePanelStyles()
  const { background, fg, border } = useDialogColors()
  const { textStyle } = useLibraryScreen()
  const { shown } = useLibraryView()
  const picker = useRecordingPickerState()

  return (
    <RecordingPickerContext value={picker}>
      <View style={styles.backdrop} testID="add-recordings">
        <View
          style={[
            styles.sheet,
            { backgroundColor: background, borderColor: border },
          ]}
        >
          <Text style={[styles.title, fg]} numberOfLines={1}>
            Add to {shown.activeName ?? 'Playlist'}
          </Text>
          <TextField
            testID="add-recordings-search"
            autoFocus
            placeholder="Search the library"
            value={picker.query}
            onChangeText={picker.setQuery}
            style={[styles.search, { borderColor: border }, textStyle, t.input]}
          />
          <PickerList />
          <SheetFooter onClose={props.onClose} />
        </View>
      </View>
    </RecordingPickerContext>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    height: '100%',
    maxHeight: 460,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: '600' },
  search: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
})

import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useRecordingPicker } from '@/components/LibraryScreen/LibraryBody/AddRecordingsSheet/useRecordingPicker'
import { useDialogColors } from '@/components/LibraryScreen/LibraryBody/useDialogColors'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { displayName } from '@/library/displayName'
import { formatDuration } from '@/library/formatDuration'
import type { Recording } from '@/native/types'

export type PickerRowProps = {
  readonly recording: Recording
  readonly index: number
}

/** A recording to choose: its check box, name, artist and length, and
 * whether it's already in the playlist. */
export const PickerRow: FC<PickerRowProps> = props => {
  const { recording: r, index } = props
  const t = usePanelStyles()
  const { fg, dim, accent } = useDialogColors()
  const { picked, toggle, already } = useRecordingPicker()
  const on = picked.includes(r.fileName)
  return (
    <Pressable
      testID={`add-${r.fileName}`}
      onPress={() => {
        toggle(r.fileName)
      }}
      style={[
        styles.row,
        t.row,
        index % 2 === 1 && t.rowAlternate,
        on && { backgroundColor: accent + '33' },
      ]}
    >
      <Text style={[styles.check, fg, t.tableText]}>{on ? '☑' : '☐'}</Text>
      <Text style={[styles.name, fg, t.tableText, t.cell]} numberOfLines={1}>
        {displayName(r)}
        {r.artist ? <Text style={dim}> · {r.artist}</Text> : null}
      </Text>
      {already.has(r.fileName) && (
        <Text style={[styles.note, dim, t.cell]}>in playlist</Text>
      )}
      <Text style={[styles.length, dim, t.cell]}>
        {formatDuration(r.durationMs)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  check: { width: 18, fontSize: 14 },
  name: { flex: 1, fontSize: 13 },
  note: { fontSize: 11, fontStyle: 'italic' },
  length: { width: 48, fontSize: 12, textAlign: 'right' },
})

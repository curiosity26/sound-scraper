// "+ Add Recordings…" in a playlist: an in-panel sheet listing the library
// with check boxes and search, to add recordings without leaving the
// playlist.
import React, { type FC } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { TextField } from '@/components/TextField'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePanelTheme } from '@/hooks/usePanelTheme'
import { displayName } from '@/library/displayName'
import { formatDuration } from '@/library/formatDuration'
import { colors } from '@/theme/colors'

import { useRecordingPicker } from './useRecordingPicker'

export type AddRecordingsSheetProps = {
  /** Cancel, or Add (the recordings go into the playlist showing). */
  readonly onClose: () => void
}

export const AddRecordingsSheet: FC<AddRecordingsSheetProps> = props => {
  const theme = usePanelTheme()
  const t = usePanelStyles()
  const { textStyle } = useLibraryScreen()
  const { recordings, shown } = useLibraryView()
  const { query, setQuery, rows, picked, toggle, pickedMs, already } =
    useRecordingPicker()
  const fg = { color: theme?.text ?? '#f3ead0' }
  const dim = { color: (theme?.text ?? '#f3ead0') + '99' }
  const accent = theme?.accent ?? colors.accent
  const border = theme?.border ?? colors.border

  return (
    <View style={styles.backdrop} testID="add-recordings">
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme?.background ?? '#2a2522',
            borderColor: border,
          },
        ]}
      >
        <Text style={[styles.title, fg]} numberOfLines={1}>
          Add to {shown.activeName ?? 'Playlist'}
        </Text>
        <TextField
          testID="add-recordings-search"
          autoFocus
          placeholder="Search the library"
          value={query}
          onChangeText={setQuery}
          style={[styles.search, { borderColor: border }, textStyle, t.input]}
        />
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
            renderItem={({ item: r, index }) => {
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
                  <Text style={[styles.check, fg, t.tableText]}>
                    {on ? '☑' : '☐'}
                  </Text>
                  <Text
                    style={[styles.name, fg, t.tableText, t.cell]}
                    numberOfLines={1}
                  >
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
            }}
          />
        </View>
        <View style={styles.footer}>
          <Text style={[styles.count, dim]}>
            {picked.length === 0
              ? 'Click recordings to choose them.'
              : `${picked.length} chosen · ${formatDuration(pickedMs)}`}
          </Text>
          <Pressable
            testID="add-recordings-cancel"
            onPress={props.onClose}
            style={[styles.button, { borderColor: border }]}
          >
            <Text style={[styles.buttonText, fg]}>Cancel</Text>
          </Pressable>
          <Pressable
            testID="add-recordings-add"
            disabled={picked.length === 0}
            onPress={() => {
              props.onClose()
              shown.addRecordings(picked)
            }}
            style={[
              styles.button,
              { borderColor: border, backgroundColor: accent },
              picked.length === 0 && styles.disabled,
            ]}
          >
            <Text style={[styles.buttonText, styles.accentText]}>
              {picked.length > 1 ? `Add ${picked.length}` : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
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
  list: { flex: 1, borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
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
  empty: { padding: 12, fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { flex: 1, fontSize: 12 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
  disabled: { opacity: 0.35 },
})

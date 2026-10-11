import React, { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { displayName } from '@/library/displayName'
import { formatDate } from '@/library/formatDate'
import { formatDuration } from '@/library/formatDuration'
import { formatSize } from '@/library/formatSize'
import type { ShowMenu } from '@/library/types'
import { TEXT_FIELDS } from '@/tags/constants'
import { colors } from '@/theme/colors'

import { FIELD_LABELS } from './constants'
import { coverUri } from './coverUri'
import { Info } from './Info'
import { InlineField } from './InlineField'
import { useRecordingDetails } from './useRecordingDetails'

export type DetailsPaneProps = {
  /** One recording, or several for a bulk edit. */
  readonly fileNames: readonly string[]
  /** A rename gave the recording a new file name. */
  readonly onRenamed: (oldName: string, newName: string) => void
  /** Something changed on disk (tags, name, trash). */
  readonly onChanged: () => void
  readonly onClose: () => void
  /** The actions menu; without it (no native menus) they show as links. */
  readonly showMenu?: ShowMenu
  /** Set to a function that opens the actions menu at (x, y) in the window
   * (the panel's title-bar menu button calls it). */
  readonly menuRef?: { current?: (x: number, y: number) => void }
  readonly textStyle: object
  readonly isDark: boolean
}

/**
 * Details of the selected recording(s): big cover art (click or drop an
 * image to replace it), the file name and tags edited in place (Enter or
 * leaving a field saves it, Esc cancels), file info, and a gear menu with
 * Show in Finder, cover and trash actions. Several recordings: a bulk edit
 * of their shared tags.
 */
export const DetailsPane: FC<DetailsPaneProps> = props => {
  const { fileNames, textStyle, isDark } = props
  const t = usePanelStyles()
  const details = useRecordingDetails({
    fileNames,
    onChanged: props.onChanged,
    onRenamed: props.onRenamed,
    onTrashed: props.onClose,
    showMenu: props.showMenu,
  })
  const { merged, cover, recording, error, notice } = details
  const [area, setArea] = useState({ width: 0, height: 0 })
  const single = fileNames.length === 1
  const key = fileNames.join('\u0000')

  if (props.menuRef) {
    props.menuRef.current = details.openMenu
  }

  // The cover leaves room below it for the file name and title (about
  // 110 points), so they show without scrolling.
  const size = Math.max(
    96,
    Math.min(area.width, area.height > 0 ? area.height - 110 : area.width),
  )
  // macOS drag-and-drop props, not in View's types.
  const dropProps: object = {
    draggedTypes: ['fileUrl'],
    onDrop: (e: {
      nativeEvent: { dataTransfer?: { files?: Array<{ uri?: string }> } }
    }) => {
      details.dropImage(e.nativeEvent.dataTransfer?.files?.[0]?.uri)
    },
  }

  return (
    <ScrollView
      style={styles.root}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setArea({ width, height })
      }}
    >
      <View {...dropProps} style={styles.coverBox}>
        <Pressable
          testID="details-cover"
          accessibilityLabel="Cover art. Click to choose an image, or drop one here."
          onPress={details.chooseCover}
          style={[
            styles.cover,
            { width: size, height: size },
            isDark && styles.coverDark,
            t.border,
          ]}
        >
          {cover.kind === 'image' ? (
            <Image
              source={{ uri: coverUri(cover.path) }}
              style={{ width: size, height: size }}
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.coverText, textStyle, t.cell]}>
              {cover.kind === 'mixed'
                ? 'Mixed covers'
                : 'No cover\nClick or drop an image'}
            </Text>
          )}
        </Pressable>
      </View>

      {details.busy && <ActivityIndicator style={styles.busy} />}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}
      {!error && notice && (
        <Text style={[styles.notice, textStyle, t.text]}>{notice}</Text>
      )}

      {!merged ? (
        !error && <ActivityIndicator />
      ) : (
        <View style={styles.fields}>
          {single ? (
            <InlineField
              testID="details-name"
              label="File name"
              value={recording ? displayName(recording) : fileNames[0] ?? ''}
              onCommit={details.rename}
              textStyle={textStyle}
              large
            />
          ) : (
            <Text style={[styles.bulk, textStyle]}>
              {fileNames.length} recordings
            </Text>
          )}
          {TEXT_FIELDS.map(field => {
            const m = merged[field]
            return (
              <InlineField
                key={`${key}-${field}`}
                testID={`details-${field}`}
                label={FIELD_LABELS[field]}
                value={m.kind === 'value' ? m.text : ''}
                mixed={m.kind === 'mixed'}
                multiline={field === 'comment'}
                onCommit={text => details.saveField(field, text)}
                textStyle={textStyle}
              />
            )
          })}
          {recording && (
            <View style={styles.info}>
              <Info
                label="Duration"
                value={formatDuration(recording.durationMs)}
                textStyle={textStyle}
              />
              <Info
                label="Size"
                value={formatSize(recording.sizeBytes)}
                textStyle={textStyle}
              />
              <Info
                label="Recorded"
                value={formatDate(recording.recordedAtMs)}
                textStyle={textStyle}
              />
              <Info
                label="File"
                value={recording.fileName}
                textStyle={textStyle}
              />
            </View>
          )}
          {!props.showMenu && (
            <View style={styles.links}>
              {details.actions.map(a => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    a.run(0, 0)
                  }}
                >
                  <Text style={[styles.link, t.link]}>{a.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={props.onClose}>
                <Text style={[styles.link, t.link]}>Close</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  coverBox: { alignItems: 'center' },
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
  },
  coverDark: { backgroundColor: '#00000033' },
  coverText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 18,
  },
  busy: { marginTop: 6 },
  error: { color: colors.error, fontSize: 12, marginTop: 6 },
  notice: { fontSize: 12, marginTop: 6, opacity: 0.8 },
  fields: { marginTop: 10 },
  bulk: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  info: { marginTop: 8, gap: 2 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  link: { color: colors.accent, fontSize: 13 },
})

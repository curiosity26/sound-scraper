import React, {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
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
import { chooseCover as chooseCoverFor } from '@/library/chooseCover'
import { displayName } from '@/library/displayName'
import { formatDate } from '@/library/formatDate'
import { formatDuration } from '@/library/formatDuration'
import { formatSize } from '@/library/formatSize'
import { openRecordingMenu } from '@/library/openRecordingMenu'
import { recordingActions } from '@/library/recordingActions'
import type { MenuContext, ShowMenu } from '@/library/types'
import { library } from '@/native/library'
import type { Recording, Tags } from '@/native/types'
import { safeSettings } from '@/recorder/safeSettings'
import { buildEdit } from '@/tags/buildEdit'
import { FIELD_LABELS, TEXT_FIELDS } from '@/tags/constants'
import type { CoverChange, CoverState, Field } from '@/tags/types'
import { colors } from '@/theme/colors'
import { errorText } from '@/utils/errorText'

import { coverUri } from './coverUri'
import { InlineField } from './InlineField'
import { mergeCovers } from './mergeCovers'
import { mergeTags } from './mergeTags'
import { validateTag } from './validateTag'

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
  const { fileNames, textStyle, isDark, onChanged } = props
  const t = usePanelStyles()
  const [tags, setTags] = useState<Tags[]>()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const single = fileNames.length === 1
  const key = fileNames.join('\u0000')

  const load = useCallback(async () => {
    const names = key.split('\u0000').filter(Boolean)
    try {
      const [loaded, all] = await Promise.all([
        Promise.all(names.map(n => library.readTags(n))),
        library.list(),
      ])
      setTags(loaded)
      setRecordings(all.filter(r => names.includes(r.fileName)))
    } catch (e) {
      setError(`Couldn't read the tags: ${errorText(e)}`)
    }
  }, [key])

  useEffect(() => {
    setTags(undefined)
    setError(undefined)
    setNotice(undefined)
    void load()
  }, [load])

  const merged = useMemo(() => (tags ? mergeTags(tags) : undefined), [tags])
  const cover: CoverState = useMemo(
    () => (tags ? mergeCovers(tags) : { kind: 'none' }),
    [tags],
  )

  /** Writes one change to every selected recording, then reloads. */
  const write = async (
    edits: Partial<Record<Field, string>>,
    coverChange: CoverChange,
  ) => {
    setBusy(true)
    setError(undefined)
    try {
      const v23 = safeSettings()?.id3Version === '2.3'
      await library.writeTags(
        [...fileNames],
        buildEdit(edits, coverChange, v23),
      )
      onChanged()
      await load()
    } catch (e) {
      setError(`Couldn't save: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveField = async (field: Field, text: string) => {
    const problem = validateTag(field, text)
    if (problem) {
      setError(problem)
      return false
    }
    await write({ [field]: text }, { kind: 'keep' })
    return true
  }

  const rename = async (text: string) => {
    const old = fileNames[0]
    if (old === undefined) {
      return true
    }
    const recording = recordings.find(r => r.fileName === old)
    if (!text.trim() || (recording && text.trim() === displayName(recording))) {
      return true
    }
    try {
      const renamed = await library.rename(old, text)
      onChanged()
      props.onRenamed(old, renamed)
      return true
    } catch (e) {
      setError(`Couldn't rename: ${errorText(e)}`)
      return false
    }
  }

  const menuContext: MenuContext = {
    fileNames,
    recordings,
    hasCover: cover.kind !== 'none',
    showMenu: props.showMenu,
    onChanged: () => {
      onChanged()
      void load()
    },
    onTrashed: props.onClose,
    report: m => {
      setError(m.isError ? m.text : undefined)
      setNotice(m.isError ? undefined : m.text)
    },
  }
  const chooseCover = () => {
    void chooseCoverFor(menuContext)
  }

  const onDrop = (e: {
    nativeEvent: { dataTransfer?: { files?: Array<{ uri?: string }> } }
  }) => {
    const uri = e.nativeEvent.dataTransfer?.files?.[0]?.uri
    const path = uri ? decodeURI(uri.replace(/^file:\/\//, '')) : undefined
    if (path && /\.(png|jpe?g)$/i.test(path)) {
      void write({}, { kind: 'set', path })
    } else if (path) {
      setError('Drop a PNG or JPEG image.')
    }
  }

  const actions = recordingActions(menuContext)
  const openMenu = (x: number, y: number) => {
    void openRecordingMenu(menuContext, x, y)
  }

  if (props.menuRef) {
    props.menuRef.current = openMenu
  }

  const recording = single ? recordings[0] : undefined
  // The cover leaves room below it for the file name and title (about
  // 110 points), so they show without scrolling.
  const size = Math.max(
    96,
    Math.min(area.width, area.height > 0 ? area.height - 110 : area.width),
  )
  // macOS drag-and-drop props, not in View's types.
  const dropProps: object = {
    draggedTypes: ['fileUrl'],
    onDrop,
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
          onPress={chooseCover}
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

      {busy && <ActivityIndicator style={styles.busy} />}
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
              onCommit={rename}
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
                onCommit={text => saveField(field, text)}
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
              {actions.map(a => (
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

type InfoProps = {
  readonly label: string
  readonly value: string
  readonly textStyle: object
}

const Info: FC<InfoProps> = props => {
  const t = usePanelStyles()
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, props.textStyle, t.cell]}>
        {props.label}
      </Text>
      <Text
        selectable
        style={[styles.infoValue, props.textStyle, t.cell]}
        numberOfLines={2}
      >
        {props.value}
      </Text>
    </View>
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
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 64, fontSize: 11, opacity: 0.6 },
  infoValue: { flex: 1, fontSize: 11 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  link: { color: colors.accent, fontSize: 13 },
})

// Pieces of the track editor: the overview with the zoom sliders, the Auto
// Slice bar, the track list, the name field and the save question.

/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react'
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { type Edits, formatTime, stepIn } from '../editorModel'
import type { DetectOptions, TrackInfo } from '../native/editor'
import WaveformNative from '../skin/WaveformNative'
import { Segmented, Stepper, ToolButton } from './controls'
import { type EditorTheme, trackColor, withAlpha } from './theme'
import { TextField } from '../TextField'

// SSWaveformView.mm on macOS, WaveformView.h on Windows.
export const SSWaveformView = WaveformNative

export const OVERVIEW = 30

/** "1.5 s", "10 s", "2 min", "300 ms". */
export function formatStep(ms: number): string {
  if (ms >= 60_000) {
    return `${ms / 60_000} min`
  }
  if (ms >= 1000) {
    return `${ms / 1000} s`
  }
  return `${ms} ms`
}

// ------------------------------------------------------------ overview

/**
 * The whole recording at a glance: its tracks, deleted stretches and a box
 * around what the editor shows. Click or drag to move the view.
 */
export function OverviewBar(props: {
  th: EditorTheme
  editorId: number
  width: number
  durationMs: number
  colors: string
  viewStartMs: number
  viewEndMs: number
  edits: Edits
  tracks: TrackInfo[]
  onScrollTo: (centerMs: number) => void
}): React.JSX.Element {
  const { th, width, durationMs } = props
  const per = durationMs / Math.max(1, width)
  const go = (e: GestureResponderEvent) =>
    props.onScrollTo(
      Math.max(0, Math.min(durationMs, e.nativeEvent.locationX * per)),
    )
  const starts = props.tracks.map(t => t.startMs)
  return (
    <View style={styles.overviewRow}>
      <View
        testID="editor-overview"
        style={[
          styles.overview,
          {
            width,
            backgroundColor: th.wave('background', '#141210'),
            borderColor: th.border,
          },
        ]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={go}
        onResponderMove={go}
        onResponderTerminationRequest={() => false}
      >
        {props.tracks.map((t, i) => (
          <View
            key={`${i}-${t.startMs}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: t.startMs / per,
              width: ((starts[i + 1] ?? durationMs) - t.startMs) / per,
              backgroundColor: withAlpha(trackColor(i), 0x30),
            }}
          />
        ))}
        {/* pointerEvents isn't supported on the native (legacy) view itself:
            setting it there crashes on macOS. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SSWaveformView
            style={StyleSheet.absoluteFill}
            editorId={props.editorId}
            startMs={0}
            msPerPoint={per}
            colors={props.colors}
          />
        </View>
        {props.edits.deleted.map(r => (
          <View
            key={r.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: r.startMs / per,
              width: Math.max(1, (r.endMs - r.startMs) / per),
              backgroundColor: th.wave('deleted', '#00000099'),
            }}
          />
        ))}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: props.viewStartMs / per,
            width: Math.max(4, (props.viewEndMs - props.viewStartMs) / per),
            borderWidth: 1.5,
            borderRadius: 3,
            borderColor: th.text,
            backgroundColor: withAlpha(th.text, 0x14),
          }}
        />
      </View>
    </View>
  )
}

// ------------------------------------------------------------ auto slice

export const DETECT_PRESETS: Record<
  'digital' | 'vinyl',
  Omit<DetectOptions, 'removeGaps'>
> = {
  // Streams and files: the gaps are digital silence.
  digital: { thresholdDb: -60, minGapMs: 1500, minTrackMs: 10_000 },
  // Vinyl, tape, radio: noise between songs.
  vinyl: { thresholdDb: -40, minGapMs: 1500, minTrackMs: 10_000 },
}

const THRESHOLDS = [
  -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20,
]
const GAPS = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000]
const MIN_TRACKS = [0, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000]

/**
 * Auto Slice's settings, in a bar above the waveform so the proposed
 * slices (dashed) stay in view while the settings change.
 */
export function AutoSliceBar(props: {
  th: EditorTheme
  options: DetectOptions
  onChange: (o: DetectOptions) => void
  found: number
  onApply: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { th, options: o, onChange } = props
  const preset = (
    Object.keys(DETECT_PRESETS) as Array<'digital' | 'vinyl'>
  ).find(
    k =>
      DETECT_PRESETS[k].thresholdDb === o.thresholdDb &&
      DETECT_PRESETS[k].minGapMs === o.minGapMs &&
      DETECT_PRESETS[k].minTrackMs === o.minTrackMs,
  )
  return (
    <View
      style={[
        styles.autoBar,
        { backgroundColor: th.raised, borderColor: th.border },
      ]}
      testID="editor-auto-slice"
    >
      <Text style={[styles.autoTitle, { color: th.text }]}>Auto Slice</Text>
      <Segmented
        th={th}
        value={preset ?? null}
        options={[
          { value: 'digital', label: 'Digital' },
          { value: 'vinyl', label: 'Vinyl / Radio' },
        ]}
        onChange={k => onChange({ ...o, ...DETECT_PRESETS[k] })}
      />
      <Stepper
        th={th}
        label="Silence below"
        value={`${o.thresholdDb} dB`}
        onStep={dir =>
          onChange({
            ...o,
            thresholdDb: stepIn(THRESHOLDS, o.thresholdDb, dir),
          })
        }
      />
      <Stepper
        th={th}
        label="Gaps over"
        value={formatStep(o.minGapMs)}
        onStep={dir =>
          onChange({ ...o, minGapMs: stepIn(GAPS, o.minGapMs, dir) })
        }
      />
      <Stepper
        th={th}
        label="Tracks over"
        value={o.minTrackMs ? formatStep(o.minTrackMs) : 'any'}
        onStep={dir =>
          onChange({ ...o, minTrackMs: stepIn(MIN_TRACKS, o.minTrackMs, dir) })
        }
      />
      <ToolButton
        th={th}
        label="Remove gaps"
        glyph={o.removeGaps ? '☑' : '☐'}
        onPress={() => onChange({ ...o, removeGaps: !o.removeGaps })}
      />
      <View style={styles.flex} />
      <Text style={[styles.autoFound, { color: th.dim }]}>
        {props.found === 0
          ? 'No gaps found'
          : `${props.found + 1} tracks · ${props.found} ${
              props.found === 1 ? 'slice' : 'slices'
            }`}
      </Text>
      <ToolButton th={th} label="Cancel" onPress={props.onCancel} />
      <ToolButton
        th={th}
        label="Add Slices"
        onPress={props.onApply}
        disabled={props.found === 0}
        accent
      />
    </View>
  )
}

// ------------------------------------------------------------ track list

/** A track's name, edited in place (Enter or leaving saves, Esc cancels). */
function TrackName(props: {
  th: EditorTheme
  value: string
  onCommit: (name: string) => void
}) {
  const [text, setText] = useState(props.value)
  useEffect(() => setText(props.value), [props.value])
  const commit = () => {
    const name = text.trim()
    if (name && name !== props.value) {
      props.onCommit(name)
    } else {
      setText(props.value)
    }
  }
  return (
    <TextField
      style={[styles.colName, styles.nameInput, { color: props.th.text }]}
      value={text}
      onChangeText={setText}
      onSubmitEditing={commit}
      onBlur={commit}
      onKeyPress={e => {
        if (e.nativeEvent.key === 'Escape') {
          setText(props.value)
        }
      }}
    />
  )
}

export type TrackRow = TrackInfo & {
  /** Who names it: a slice id, or the first track. */
  owner: number | 'first' | null
  name: string
}

export function TrackList(props: {
  th: EditorTheme
  rows: TrackRow[]
  selected: number | null
  showReencode: boolean
  onSelect: (index: number) => void
  onRename: (owner: number | 'first', name: string) => void
}): React.JSX.Element {
  const { th } = props
  return (
    <View style={[styles.tracks, { borderColor: th.border }]}>
      <View
        style={[
          styles.trackRow,
          styles.trackHeader,
          { borderBottomColor: th.border },
        ]}
      >
        <Text style={[styles.colNum, styles.headerText, { color: th.dim }]}>
          #
        </Text>
        <Text style={[styles.colName, styles.headerText, { color: th.dim }]}>
          Title and file name
        </Text>
        <Text style={[styles.colTime, styles.headerText, { color: th.dim }]}>
          Start
        </Text>
        <Text style={[styles.colTime, styles.headerText, { color: th.dim }]}>
          Length
        </Text>
      </View>
      <ScrollView>
        {props.rows.map((tr, i) => {
          const selected = props.selected === i
          return (
            <Pressable
              key={`${i}-${tr.startMs}`}
              onPress={() => props.onSelect(i)}
              style={[
                styles.trackRow,
                selected && { backgroundColor: withAlpha(trackColor(i), 0x38) },
              ]}
            >
              <View style={[styles.colNum, styles.numCell]}>
                <View
                  style={[styles.chip, { backgroundColor: trackColor(i) }]}
                />
                <Text style={[styles.cell, { color: th.text }]}>{i + 1}</Text>
              </View>
              {tr.owner === null ? (
                <Text style={[styles.colName, styles.cell, { color: th.text }]}>
                  {tr.name}
                </Text>
              ) : (
                <TrackName
                  th={th}
                  value={tr.name}
                  onCommit={name => props.onRename(tr.owner!, name)}
                />
              )}
              <Text style={[styles.colTime, styles.cell, { color: th.dim }]}>
                {formatTime(tr.startMs, 100)}
              </Text>
              <View style={[styles.colTime, styles.lengthCell]}>
                {tr.reencode && props.showReencode && (
                  <Text
                    style={[
                      styles.pill,
                      { color: th.dim, borderColor: th.border },
                    ]}
                  >
                    re-encodes
                  </Text>
                )}
                <Text style={[styles.cell, { color: th.dim }]}>
                  {formatTime(tr.durationMs, 100)}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ------------------------------------------------------------ naming

/** The name field over a new (or double-clicked) track. */
export function NameField(props: {
  th: EditorTheme
  left: number
  top: number
  value: string
  onChange: (text: string) => void
  /** Close it, keeping the text (or not, for Esc). */
  onDone: (keep?: boolean) => void
}): React.JSX.Element {
  const { th } = props
  return (
    <View style={[styles.nameField, { left: props.left, top: props.top }]}>
      <TextField
        testID="editor-slice-name"
        autoFocus
        selectTextOnFocus
        value={props.value}
        onChangeText={props.onChange}
        onSubmitEditing={() => props.onDone()}
        onBlur={() => props.onDone()}
        onKeyPress={e => {
          if (e.nativeEvent.key === 'Escape') {
            props.onDone(false)
          }
        }}
        style={[
          styles.nameFieldInput,
          {
            color: th.text,
            backgroundColor: th.background,
            borderColor: th.accent,
          },
        ]}
      />
    </View>
  )
}

// ------------------------------------------------------------ saving

/** Save: the in-window question whether to keep the original. */
export function SaveModal(props: {
  th: EditorTheme
  title: string
  count: number
  reencoded: number
  fromMaster: boolean
  saving: boolean
  error?: string
  onCancel: () => void
  onChoose: (keepOriginal: boolean) => void
}): React.JSX.Element {
  const { th } = props
  return (
    <View style={styles.modalBackdrop} testID="editor-save-modal">
      <View
        style={[
          styles.modal,
          { backgroundColor: th.background, borderColor: th.border },
        ]}
      >
        <Text style={[styles.modalTitle, { color: th.text }]}>
          Keep the original recording?
        </Text>
        <Text style={[styles.modalBody, { color: th.text }]}>
          Saving creates{' '}
          {props.count === 1 ? '1 track' : `${props.count} tracks`} from “
          {props.title}”.
          {props.reencoded > 0
            ? ` ${
                props.reencoded === 1 ? 'One is' : `${props.reencoded} are`
              } re-encoded because a stretch inside was deleted.`
            : ''}
          {props.fromMaster
            ? ' Each is encoded once from the lossless master, cut exactly.'
            : ''}
        </Text>
        {props.error && (
          <Text style={[styles.modalBody, styles.error]}>
            Couldn't save: {props.error}
          </Text>
        )}
        {props.saving ? (
          <Text style={[styles.modalBody, { color: th.dim }]}>Saving…</Text>
        ) : (
          <View style={styles.modalButtons}>
            <ToolButton th={th} label="Cancel" onPress={props.onCancel} />
            <ToolButton
              th={th}
              label="No, delete it"
              onPress={() => props.onChoose(false)}
            />
            <ToolButton
              th={th}
              label="Yes, keep it"
              onPress={() => props.onChoose(true)}
              accent
            />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  overview: {
    height: OVERVIEW,
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
  },
  autoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  autoTitle: { fontSize: 12, fontWeight: '600' },
  autoFound: { fontSize: 11 },
  tracks: {
    height: 112,
    flexShrink: 1,
    minHeight: 54,
    marginTop: 6,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trackHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  colNum: { width: 34 },
  numCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { width: 8, height: 8, borderRadius: 2 },
  colName: { flex: 1 },
  colTime: { width: 120, textAlign: 'right' },
  lengthCell: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  cell: { fontSize: 12, fontVariant: ['tabular-nums'] },
  pill: {
    fontSize: 9,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  // Explicit heights and no vertical padding: Windows' text box otherwise
  // adds its own and clips the text in these short rows.
  nameInput: {
    height: 20,
    paddingTop: Platform.OS === 'windows' ? 2 : 0,
    paddingBottom: 0,
    paddingHorizontal: 2,
    fontSize: 12,
    textAlignVertical: 'center',
  },
  nameField: { position: 'absolute', width: 200 },
  nameFieldInput: {
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    fontSize: 12,
    paddingTop: Platform.OS === 'windows' ? 2 : 0,
    paddingBottom: 0,
    paddingHorizontal: 5,
    textAlignVertical: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { width: 380, padding: 18, borderRadius: 10, borderWidth: 1, gap: 10 },
  modalTitle: { fontSize: 14, fontWeight: '600' },
  modalBody: { fontSize: 12, lineHeight: 17 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  error: { color: '#ff6b5a' },
})

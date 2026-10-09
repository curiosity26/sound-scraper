// The library's playlist picker, its menu actions and in-panel prompts, the
// "Add to ▾" action for checked rows, and the CD capacity bar
// (docs/playlists-and-cd-burning-design.md §5).
import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { errorText } from './appHelpers'
import { burnApi } from './burnModel'
import { pickSaveFile, playlistsApi } from './native/SoundScraper'
import { usePanelStyles, usePanelTheme } from './panelTheme'
import {
  type Capacity,
  capacitySummary,
  capacityText,
  SECTORS_74,
  SECTORS_80,
} from './playlistModel'
import { playlists, type PlaylistsState } from './playlists'
import { colors } from './theme'
import { TextField } from './TextField'

/** Native pop-up menu at (x, y) in the panel; resolves with the index or -1. */
export type ShowMenu = (
  items: string[],
  checked: number,
  x: number,
  y: number,
) => Promise<number>

type Prompt =
  | {
      kind: 'name'
      title: string
      value: string
      onDone: (name: string) => void
    }
  | {
      kind: 'confirm'
      title: string
      body: string
      action: string
      onDone: () => void
    }
  | {
      kind: 'duplicates'
      playlistId: number
      playlistName: string
      fileNames: string[]
      already: number
    }

const NEW = 'New Playlist…'

/** Where a pressed view sits in its window, for a pop-up menu under it. */
function menuPoint(
  view: View | null,
  then: (x: number, y: number) => void,
): void {
  if (!view) {
    then(0, 0)
    return
  }
  view.measureInWindow((x, y, _w, h) => then(x, y + h))
}

/** "Playlist 3": the first free default name. */
function defaultName(state: PlaylistsState): string {
  const taken = new Set(state.playlists.map(p => p.name.toLowerCase()))
  for (let n = 1; ; n++) {
    const name = `Playlist ${n}`
    if (!taken.has(name.toLowerCase())) {
      return name
    }
  }
}

export function usePlaylistControls(props: {
  state: PlaylistsState
  showMenu: ShowMenu
  textStyle: object
  onMessage: (m: { text: string; isError: boolean }) => void
}) {
  const { state, showMenu, onMessage } = props
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const picker = useRef<View>(null)
  const actionsButton = useRef<View>(null)
  const addTo = useRef<View>(null)
  const active = state.playlists.find(p => p.id === state.activeId)

  const run = (what: string, f: () => void) => {
    try {
      f()
    } catch (e) {
      onMessage({ text: `Couldn't ${what}: ${errorText(e)}`, isError: true })
    }
  }

  const newPlaylist = (fileNames: string[] = []) =>
    setPrompt({
      kind: 'name',
      title: fileNames.length
        ? `New playlist with ${
            fileNames.length === 1
              ? '1 recording'
              : `${fileNames.length} recordings`
          }`
        : 'New playlist',
      value: defaultName(state),
      onDone: name =>
        run('create the playlist', () => {
          const made = playlists.create(name, fileNames)
          if (fileNames.length === 0) {
            playlists.show(made.id)
          } else {
            onMessage({
              text: `Added to ${made.name}.`,
              isError: false,
            })
          }
        }),
    })

  const exportM3u8 = async (id: number, name: string) => {
    try {
      const path = await pickSaveFile('Export playlist', `${name}.m3u8`, 'm3u8')
      if (!path) {
        return
      }
      const missing = playlistsApi.exportM3u8(id, path)
      onMessage({
        text:
          missing > 0
            ? `Exported ${name}; ${missing} missing ${
                missing === 1 ? 'recording was' : 'recordings were'
              } left out.`
            : `Exported ${name}.`,
        isError: false,
      })
    } catch (e) {
      onMessage({ text: `Couldn't export: ${errorText(e)}`, isError: true })
    }
  }

  /** The playlist picker: the library, New Playlist…, then the playlists
   * (so the fixed items stay at the top however many playlists there are). */
  const openPicker = () =>
    menuPoint(picker.current, async (x, y) => {
      const names = state.playlists.map(p => p.name)
      const items = ['Library', NEW, ...(names.length ? ['-', ...names] : [])]
      const checkedIndex =
        state.activeId === null
          ? 0
          : 3 + state.playlists.findIndex(p => p.id === state.activeId)
      const chosen = await showMenu(items, checkedIndex, x, y)
      if (chosen === 0) {
        run('show the library', () => playlists.show(null))
      } else if (chosen === 1) {
        newPlaylist()
      } else if (chosen >= 3 && chosen < 3 + names.length) {
        const id = state.playlists[chosen - 3].id
        run('show the playlist', () => playlists.show(id))
      }
    })

  /** The ⋯ menu beside the picker: what to do with the playlist showing. */
  const openActions = () =>
    menuPoint(actionsButton.current, async (x, y) => {
      if (!active) {
        return
      }
      const actions: Array<[string, () => void]> = [
        [
          'Rename Playlist…',
          () =>
            setPrompt({
              kind: 'name',
              title: 'Rename playlist',
              value: active.name,
              onDone: name =>
                run('rename the playlist', () =>
                  playlists.rename(active.id, name),
                ),
            }),
        ],
        [
          'Duplicate Playlist',
          () =>
            run('duplicate the playlist', () => playlists.duplicate(active.id)),
        ],
        ['Export as .m3u8…', () => exportM3u8(active.id, active.name)],
        [
          'Delete Playlist…',
          () =>
            setPrompt({
              kind: 'confirm',
              title: `Delete “${active.name}”?`,
              body: 'The recordings stay in your library.',
              action: 'Delete',
              onDone: () =>
                run('delete the playlist', () => playlists.delete(active.id)),
            }),
        ],
      ]
      // A separator before Delete.
      const items = [...actions.slice(0, 3).map(a => a[0]), '-', actions[3][0]]
      const chosen = await showMenu(items, -1, x, y)
      if (chosen >= 0 && chosen < 3) {
        actions[chosen][1]()
      } else if (chosen === 4) {
        actions[3][1]()
      }
    })

  /** Adds checked recordings to a playlist chosen from a menu. */
  const openAddTo = (fileNames: string[], at?: { x: number; y: number }) => {
    const show = async (x: number, y: number) => {
      const others = state.playlists
      const items = [
        ...others.map(p => p.name),
        ...(others.length ? ['-'] : []),
        NEW,
      ]
      const chosen = await showMenu(items, -1, x, y)
      if (chosen < 0) {
        return
      }
      if (chosen >= others.length) {
        newPlaylist(fileNames)
        return
      }
      const target = others[chosen]
      addToPlaylist(target.id, target.name, fileNames)
    }
    if (at) {
      show(at.x, at.y)
    } else {
      menuPoint(addTo.current, show)
    }
  }

  const addToPlaylist = (id: number, name: string, fileNames: string[]) =>
    run('add to the playlist', () => {
      const there = playlists.fileNamesIn(id)
      const already = fileNames.filter(f => there.has(f)).length
      if (already > 0) {
        setPrompt({
          kind: 'duplicates',
          playlistId: id,
          playlistName: name,
          fileNames,
          already,
        })
        return
      }
      playlists.add(id, fileNames)
      onMessage({ text: `Added to ${name}.`, isError: false })
    })

  return {
    prompt,
    setPrompt,
    picker,
    actionsButton,
    addTo,
    active,
    openPicker,
    openActions,
    openAddTo,
    addToPlaylist,
  }
}

export type PlaylistControls = ReturnType<typeof usePlaylistControls>

/** The picker button: "▾ Library" or "▾ Road Trip". */
export function PlaylistPicker(props: {
  controls: PlaylistControls
  textStyle: object
}): React.JSX.Element {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { controls } = props
  return (
    <Pressable
      ref={controls.picker}
      testID="playlist-picker"
      accessibilityRole="button"
      accessibilityLabel="Choose the library or a playlist"
      onPress={controls.openPicker}
      style={({ pressed }) => [
        styles.picker,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[styles.pickerText, props.textStyle, t.text, t.cell]}
        numberOfLines={1}
      >
        {controls.active?.name ?? 'Library'}
      </Text>
      <Text style={[styles.pickerArrow, props.textStyle, t.text]}>▾</Text>
    </Pressable>
  )
}

/** ⋯: rename, duplicate, export or delete the playlist showing. */
export function PlaylistActionsButton(props: {
  controls: PlaylistControls
  textStyle: object
}): React.JSX.Element | null {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const { controls } = props
  if (!controls.active) {
    return null
  }
  return (
    <Pressable
      ref={controls.actionsButton}
      testID="playlist-actions"
      accessibilityRole="button"
      accessibilityLabel="Playlist actions"
      onPress={controls.openActions}
      style={({ pressed }) => [
        styles.picker,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.pickerText, props.textStyle, t.text, t.cell]}>
        ⋯
      </Text>
    </Pressable>
  )
}

/** "Add to ▾", for checked rows. */
export function AddToButton(props: {
  controls: PlaylistControls
  fileNames: string[]
}): React.JSX.Element | null {
  const t = usePanelStyles()
  if (props.fileNames.length === 0) {
    return null
  }
  return (
    <Pressable
      ref={props.controls.addTo}
      testID="playlist-add-to"
      onPress={() => props.controls.openAddTo(props.fileNames)}
    >
      <Text style={[styles.link, t.link, t.cell]}>Add to ▾</Text>
    </Pressable>
  )
}

/** The CD capacity bar with 74 and 80 minute marks, and what it means. */
export function CapacityBar(props: {
  capacity: Capacity
  textStyle: object
  /** Beside the summary (Burn CD…). */
  action?: React.ReactNode
}): React.JSX.Element {
  const theme = usePanelTheme()
  const t = usePanelStyles()
  const pc = theme?.playlist ?? {}
  const c = props.capacity
  // The scale runs a little past 80 minutes so "too long" shows.
  const scale = SECTORS_80 * 1.1
  const fill =
    c.fit === 'fits74'
      ? pc.fill ?? theme?.accent ?? colors.accent
      : c.fit === 'fits80'
      ? pc.fill80 ?? '#e0a030'
      : pc.over ?? colors.error
  const text = pc.text ?? theme?.text
  const pct = (sectors: number) => `${Math.min(100, (sectors / scale) * 100)}%`
  return (
    <View style={styles.capacity} testID="cd-capacity">
      <View style={styles.capacityTop}>
        <Text
          style={[
            styles.capacityLine,
            styles.capacitySummary,
            props.textStyle,
            { color: text },
            t.cell,
          ]}
        >
          {capacitySummary(c)}
        </Text>
        {props.action}
      </View>
      <View
        style={[styles.bar, { backgroundColor: pc.track ?? '#0004' }]}
        accessibilityLabel={capacityText(c)}
      >
        <View
          style={[
            styles.barFill,
            {
              width: pct(c.totalSectors) as `${number}%`,
              backgroundColor: fill,
            },
          ]}
        />
        {[SECTORS_74, SECTORS_80].map(mark => (
          <View
            key={mark}
            style={[
              styles.mark,
              {
                left: pct(mark) as `${number}%`,
                backgroundColor: pc.mark ?? text ?? '#fff',
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.marks}>
        <Text
          style={[
            styles.markLabel,
            { color: text, left: pct(SECTORS_74) as `${number}%` },
          ]}
        >
          74
        </Text>
        <Text
          style={[
            styles.markLabel,
            { color: text, left: pct(SECTORS_80) as `${number}%` },
          ]}
        >
          80
        </Text>
      </View>
      <Text
        style={[
          styles.capacityLine,
          props.textStyle,
          { color: c.fit === 'tooLong' || c.fit === 'tooMany' ? fill : text },
          t.cell,
        ]}
      >
        {capacityText(c)}
      </Text>
    </View>
  )
}

/** Burn CD… (a CD writer is there) or Save CD Image… (none is). */
export function BurnButton(props: {
  capacity: Capacity
  onPress: () => void
}): React.JSX.Element {
  const t = usePanelStyles()
  const theme = usePanelTheme()
  const [hasBurner, setHasBurner] = useState(false)
  useEffect(() => {
    const check = () => {
      try {
        setHasBurner(burnApi.devices().devices.some(d => d.kind !== 'image'))
      } catch {
        setHasBurner(false)
      }
    }
    check()
    // Burners can be plugged in at any time.
    const timer = setInterval(check, 3000)
    return () => clearInterval(timer)
  }, [])
  const c = props.capacity
  const disabled =
    c.fit === 'empty' || c.fit === 'tooMany' || c.fit === 'tooLong'
  return (
    <Pressable
      testID="burn-cd"
      disabled={disabled}
      accessibilityHint={disabled ? capacityText(c) : undefined}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: theme?.border ?? colors.border,
          backgroundColor: theme?.accent ?? colors.accent,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, styles.accentText, t.cell]}>
        {hasBurner ? 'Burn CD…' : 'Save CD Image…'}
      </Text>
    </Pressable>
  )
}

/** The in-panel prompt (name a playlist, confirm a delete, duplicates). */
export function PlaylistPrompt(props: {
  controls: PlaylistControls
  textStyle: object
  onMessage: (m: { text: string; isError: boolean }) => void
}): React.JSX.Element | null {
  const { prompt, setPrompt } = props.controls
  const theme = usePanelTheme()
  const t = usePanelStyles()
  if (!prompt) {
    return null
  }
  const bg = theme?.background ?? '#2a2522'
  const fg = { color: theme?.text ?? '#f3ead0' }
  const close = () => setPrompt(null)
  const button = (label: string, onPress: () => void, accent = false) => (
    <Pressable
      key={label}
      testID={`prompt-${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: accent
            ? theme?.accent ?? colors.accent
            : 'transparent',
          borderColor: theme?.border ?? colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, accent ? styles.accentText : fg]}>
        {label}
      </Text>
    </Pressable>
  )

  let title: string
  let body: React.ReactNode = null
  let buttons: React.ReactNode[]
  switch (prompt.kind) {
    case 'name': {
      title = prompt.title
      const value = prompt.value
      const ok = () => {
        if (value.trim()) {
          close()
          prompt.onDone(value.trim())
        }
      }
      body = (
        <TextField
          testID="playlist-name"
          autoFocus
          selectTextOnFocus
          value={value}
          onChangeText={text => setPrompt({ ...prompt, value: text })}
          onSubmitEditing={ok}
          onKeyPress={e => e.nativeEvent.key === 'Escape' && close()}
          style={[styles.input, props.textStyle, t.input]}
        />
      )
      buttons = [button('Cancel', close), button('OK', ok, true)]
      break
    }
    case 'confirm':
      title = prompt.title
      body = <Text style={[styles.body, fg]}>{prompt.body}</Text>
      buttons = [
        button('Cancel', close),
        button(
          prompt.action,
          () => {
            close()
            prompt.onDone()
          },
          true,
        ),
      ]
      break
    case 'duplicates': {
      const n = prompt.fileNames.length
      const all = prompt.already === n
      title = all
        ? `Already in ${prompt.playlistName}`
        : `Some are already in ${prompt.playlistName}`
      body = (
        <Text style={[styles.body, fg]}>
          {all
            ? n === 1
              ? 'This recording is already in the playlist. Add it again?'
              : `All ${n} recordings are already in the playlist. Add them again?`
            : `${prompt.already} of the ${n} recordings ${
                prompt.already === 1 ? 'is' : 'are'
              } already in the playlist.`}
        </Text>
      )
      const add = (names: string[]) => {
        close()
        try {
          if (names.length) {
            playlists.add(prompt.playlistId, names)
          }
          props.onMessage({
            text: `Added to ${prompt.playlistName}.`,
            isError: false,
          })
        } catch (e) {
          props.onMessage({
            text: `Couldn't add to the playlist: ${errorText(e)}`,
            isError: true,
          })
        }
      }
      const there = () => playlists.fileNamesIn(prompt.playlistId)
      buttons = [
        button('Cancel', close),
        ...(all
          ? []
          : [
              button('Skip Them', () => {
                const have = there()
                add(prompt.fileNames.filter(f => !have.has(f)))
              }),
            ]),
        button(
          all ? 'Add Again' : 'Add All',
          () => add(prompt.fileNames),
          true,
        ),
      ]
      break
    }
  }
  return (
    <View style={styles.backdrop} testID="playlist-prompt">
      <View
        style={[
          styles.modal,
          { backgroundColor: bg, borderColor: theme?.border ?? colors.border },
        ]}
      >
        <Text style={[styles.title, fg]}>{title}</Text>
        {body}
        <View style={styles.buttons}>{buttons}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 4,
    gap: 6,
  },
  pickerText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  pickerArrow: { fontSize: 11 },
  link: { color: colors.accent, fontSize: 13 },
  capacity: { marginTop: 6, gap: 3 },
  capacityLine: { fontSize: 12 },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacitySummary: { flex: 1 },
  bar: { height: 8, borderRadius: 2, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  marks: { height: 11 },
  markLabel: { position: 'absolute', fontSize: 9, marginLeft: -6, top: -2 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    width: 320,
    maxWidth: '92%',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  title: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 17 },
  input: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  buttonText: { fontSize: 12, fontWeight: '600' },
  accentText: { color: '#111' },
})

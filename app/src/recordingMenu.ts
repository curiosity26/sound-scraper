// The actions menu for recordings: the details panel's gear menu, and the
// same menu on right-clicking rows in the library or a playlist.
import { Alert, Platform } from 'react-native'

import { errorText, safeSettings } from './appHelpers'
import { displayName } from './libraryModel'
import { editorAvailable } from './native/editor'
import { library, type Recording } from './native/SoundScraper'
import { playlists } from './playlists'
import { editorTarget, skinsAvailable, windows } from './skin/skins'
import { buildEdit, type CoverChange } from './tagModel'

const isWindows = Platform.OS === 'windows'
export const REVEAL_LABEL = isWindows ? 'Show in Explorer' : 'Show in Finder'
export const TRASH_LABEL = isWindows ? 'Move to Recycle Bin' : 'Move to Trash'
const TRASH_NAME = isWindows ? 'the Recycle Bin' : 'the Trash'

/** A native pop-up menu at (x, y) in the panel; resolves with the index or -1. */
export type ShowMenu = (
  items: string[],
  x: number,
  y: number,
) => Promise<number>

export type MenuAction = { label: string; run: (x: number, y: number) => void }

export type MenuContext = {
  /** The recordings the menu acts on. */
  fileNames: string[]
  /** Their library entries (for titles and the editor). */
  recordings: Recording[]
  hasCover: boolean
  showMenu?: ShowMenu
  /** Tags or files changed: refresh what's shown. */
  onChanged: () => void
  /** They went to the Trash. */
  onTrashed?: () => void
  /** A note or an error for the user. */
  report: (message: { text: string; isError: boolean }) => void
  /** Extra actions, shown before the destructive last one. */
  extra?: MenuAction[]
}

async function writeCover(ctx: MenuContext, change: CoverChange) {
  try {
    const v23 = safeSettings()?.id3Version === '2.3'
    await library.writeTags(ctx.fileNames, buildEdit({}, change, v23))
    ctx.onChanged()
  } catch (e) {
    ctx.report({ text: `Couldn't save: ${errorText(e)}`, isError: true })
  }
}

export async function chooseCover(ctx: MenuContext) {
  try {
    const path = await library.pickImage()
    if (path) {
      await writeCover(ctx, { kind: 'set', path })
    }
  } catch (e) {
    ctx.report({ text: errorText(e), isError: true })
  }
}

function trash(ctx: MenuContext) {
  const names = ctx.fileNames
  const first = ctx.recordings.find(r => r.fileName === names[0])
  const what =
    names.length > 1
      ? `${names.length} recordings`
      : `"${first ? displayName(first) : names[0]}"`
  Alert.alert(
    `Move ${what} to ${TRASH_NAME}?`,
    undefined,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: TRASH_LABEL,
        style: 'destructive',
        onPress: async () => {
          try {
            for (const name of names) {
              await library.trash(name)
            }
            ctx.onChanged()
            ctx.onTrashed?.()
          } catch (e) {
            ctx.report({
              text: `Couldn't move to ${TRASH_NAME}: ${errorText(e)}`,
              isError: true,
            })
          }
        },
      },
    ],
    { cancelable: true },
  )
}

function editTrack(ctx: MenuContext) {
  const r = ctx.recordings[0]
  if (!r) {
    return
  }
  editorTarget.set({
    fileName: r.fileName,
    path: r.path,
    title: displayName(r),
    durationMs: r.durationMs,
  })
  windows.setPanelVisible('editor', true)
}

/** Add to Playlist…: a second menu of the playlists, where the first was. */
async function addToPlaylist(ctx: MenuContext, x: number, y: number) {
  const all = playlists.get().playlists
  if (!ctx.showMenu || all.length === 0) {
    return
  }
  const chosen = await ctx.showMenu(
    all.map(p => p.name),
    x,
    y,
  )
  const target = all[chosen]
  if (!target) {
    return
  }
  try {
    const there = playlists.fileNamesIn(target.id)
    const adding = ctx.fileNames.filter(n => !there.has(n))
    if (adding.length > 0) {
      playlists.add(target.id, adding)
    }
    ctx.report({
      text:
        adding.length === 0
          ? `Already in ${target.name}.`
          : adding.length < ctx.fileNames.length
          ? `Added to ${target.name} (${
              ctx.fileNames.length - adding.length
            } already there).`
          : `Added to ${target.name}.`,
      isError: false,
    })
  } catch (e) {
    ctx.report({
      text: `Couldn't add to the playlist: ${errorText(e)}`,
      isError: true,
    })
  }
}

export function recordingActions(ctx: MenuContext): MenuAction[] {
  const single = ctx.fileNames.length === 1
  return [
    ...(single && editorAvailable && skinsAvailable && ctx.recordings[0]
      ? [{ label: 'Edit Track…', run: () => editTrack(ctx) }]
      : []),
    ...(ctx.showMenu && playlists.get().playlists.length > 0
      ? [
          {
            label: 'Add to Playlist…',
            run: (x: number, y: number) => addToPlaylist(ctx, x, y),
          },
        ]
      : []),
    ...(single
      ? [{ label: REVEAL_LABEL, run: () => library.reveal(ctx.fileNames[0]) }]
      : []),
    { label: 'Change cover…', run: () => chooseCover(ctx) },
    ...(ctx.hasCover
      ? [
          {
            label: 'Remove cover',
            run: () => writeCover(ctx, { kind: 'remove' }),
          },
        ]
      : []),
    ...(ctx.extra ?? []),
    { label: `${TRASH_LABEL}…`, run: () => trash(ctx) },
  ]
}

/** Pops up the actions menu at (x, y), a separator before the last one. */
export async function openRecordingMenu(
  ctx: MenuContext,
  x: number,
  y: number,
) {
  if (!ctx.showMenu) {
    return
  }
  const actions = recordingActions(ctx)
  const last = actions.length - 1
  const items = [
    ...actions.slice(0, last).map(a => a.label),
    '-',
    actions[last].label,
  ]
  const chosen = await ctx.showMenu(items, x, y)
  if (chosen >= 0 && chosen < last) {
    actions[chosen].run(x, y)
  } else if (chosen === items.length - 1) {
    actions[last].run(x, y)
  }
}

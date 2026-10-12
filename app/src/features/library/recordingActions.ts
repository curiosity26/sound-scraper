// The actions menu for recordings: the details panel's gear menu, and the
// same menu on right-clicking rows in the library or a playlist.
import { Alert } from 'react-native'

import { editorAvailable } from '@/features/editor/editorAvailable'
import { editorTarget } from '@/features/editor/editorTarget'
import { playlists } from '@/features/playlists/playlists'
import { skinsAvailable } from '@/features/skins/skinsAvailable'
import { windows } from '@/features/skins/windows'
import { errorText } from '@/shared/utils/errorText'

import { chooseCover } from './chooseCover'
import { REVEAL_LABEL, TRASH_LABEL, TRASH_NAME } from './constants'
import { displayName } from './displayName'
import { library } from './library'
import type { MenuAction, MenuContext } from './types'
import { writeCover } from './writeCover'

const trash = (ctx: MenuContext) => {
  const names = ctx.fileNames
  const first = ctx.recordings.find(r => r.fileName === names[0])
  const what =
    names.length > 1
      ? `${String(names.length)} recordings`
      : `"${first ? displayName(first) : String(names[0])}"`
  const moveToTrash = async () => {
    for (const name of names) {
      await library.trash(name)
    }
    ctx.onChanged()
    ctx.onTrashed?.()
  }
  Alert.alert(
    `Move ${what} to ${TRASH_NAME}?`,
    undefined,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: TRASH_LABEL,
        style: 'destructive',
        onPress: () => {
          moveToTrash().catch((e: unknown) => {
            ctx.report({
              text: `Couldn't move to ${TRASH_NAME}: ${errorText(e)}`,
              isError: true,
            })
          })
        },
      },
    ],
    { cancelable: true },
  )
}

const editTrack = (ctx: MenuContext) => {
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
const addToPlaylist = async (ctx: MenuContext, x: number, y: number) => {
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
        ? `Added to ${target.name} (${String(
            ctx.fileNames.length - adding.length,
          )} already there).`
        : `Added to ${target.name}.`,
    isError: false,
  })
}

export const recordingActions = (ctx: MenuContext): MenuAction[] => {
  const single = ctx.fileNames.length === 1
  return [
    ...(single && editorAvailable && skinsAvailable && ctx.recordings[0]
      ? [
          {
            label: 'Edit Track…',
            run: () => {
              editTrack(ctx)
            },
          },
        ]
      : []),
    ...(ctx.showMenu && playlists.get().playlists.length > 0
      ? [
          {
            label: 'Add to Playlist…',
            run: (x: number, y: number) => {
              addToPlaylist(ctx, x, y).catch((e: unknown) => {
                ctx.report({
                  text: `Couldn't add to the playlist: ${errorText(e)}`,
                  isError: true,
                })
              })
            },
          },
        ]
      : []),
    ...(single
      ? [
          {
            label: REVEAL_LABEL,
            run: () => {
              const [name] = ctx.fileNames
              if (name !== undefined) {
                library.reveal(name)
              }
            },
          },
        ]
      : []),
    {
      label: 'Change cover…',
      run: () => {
        chooseCover(ctx)
      },
    },
    ...(ctx.hasCover
      ? [
          {
            label: 'Remove cover',
            run: () => {
              writeCover(ctx, { kind: 'remove' })
            },
          },
        ]
      : []),
    ...(ctx.extra ?? []),
    {
      label: `${TRASH_LABEL}…`,
      run: () => {
        trash(ctx)
      },
    },
  ]
}

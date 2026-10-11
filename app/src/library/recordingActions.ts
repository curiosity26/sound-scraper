// The actions menu for recordings: the details panel's gear menu, and the
// same menu on right-clicking rows in the library or a playlist.
import { Alert } from 'react-native'

import { editorAvailable } from '@/native/editorAvailable'
import { library } from '@/native/library'
import { playlists } from '@/playlists/playlists'
import { editorTarget } from '@/skin/editorTarget'
import { skinsAvailable } from '@/skin/skinsAvailable'
import { windows } from '@/skin/windows'
import { errorText } from '@/utils/errorText'

import { chooseCover } from './chooseCover'
import { REVEAL_LABEL, TRASH_LABEL, TRASH_NAME } from './constants'
import { displayName } from './displayName'
import type { MenuAction, MenuContext } from './types'
import { writeCover } from './writeCover'

const trash = (ctx: MenuContext) => {
  const names = ctx.fileNames
  const first = ctx.recordings.find(r => r.fileName === names[0])
  const what =
    names.length > 1
      ? `${names.length} recordings`
      : `"${first ? displayName(first) : names[0]}"`
  const moveToTrash = async () => {
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
          void moveToTrash()
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
              void addToPlaylist(ctx, x, y)
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
        void chooseCover(ctx)
      },
    },
    ...(ctx.hasCover
      ? [
          {
            label: 'Remove cover',
            run: () => {
              void writeCover(ctx, { kind: 'remove' })
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

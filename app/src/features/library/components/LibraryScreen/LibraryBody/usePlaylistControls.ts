// The library's playlist picker, its menu actions and in-panel prompts, the
// "Add to ▾" action for checked rows, and the CD capacity bar
// (docs/playlists-and-cd-burning-design.md §5).
import type { View } from 'react-native'

import type { Playlist } from '@/bridge/generated'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { playlists, type PlaylistsState } from '@/features/playlists/playlists'
import { playlistsApi } from '@/features/playlists/playlistsApi'
import { errorText } from '@/shared/utils/errorText'
import { pickSaveFile } from '@/shared/utils/pickSaveFile'

import { useLibraryView } from './useLibraryView'
import { usePlaylistPrompt } from './usePlaylistPrompt'

const NEW = 'New Playlist…'

/** Where a pressed view sits in its window, for a pop-up menu under it. */
const menuPoint = (
  view: View | null,
  then: (x: number, y: number) => void,
): void => {
  if (!view) {
    then(0, 0)
    return
  }
  view.measureInWindow((x, y, _w, h) => {
    then(x, y + h)
  })
}

/** "Playlist 3": the first free default name. */
const defaultName = (state: PlaylistsState): string => {
  const taken = new Set(state.playlists.map(p => p.name.toLowerCase()))
  for (let n = 1; ; n++) {
    const name = `Playlist ${n}`
    if (!taken.has(name.toLowerCase())) {
      return name
    }
  }
}

export type UsePlaylistControlsResult = {
  /** The playlist showing, if any. */
  readonly active: Playlist | undefined
  /** Each opens its menu under the pressed button. */
  readonly openPicker: (button: View | null) => void
  readonly openActions: (button: View | null) => void
  readonly openAddTo: (
    fileNames: readonly string[],
    button: View | null,
  ) => void
}

/** The menus behind the picker, ⋯ and "Add to ▾" (in-panel prompts go to
 * PlaylistPromptContext, which PlaylistPrompt shows). */
export const usePlaylistControls = (): UsePlaylistControlsResult => {
  const { showLibraryMenu, onMessage } = useLibraryScreen()
  const state = useLibraryView().playlistsState
  const { setPrompt } = usePlaylistPrompt()
  const showMenu = showLibraryMenu ?? (() => Promise.resolve(-1))
  const active = state.playlists.find(p => p.id === state.activeId)

  const run = (what: string, f: () => void) => {
    try {
      f()
    } catch (e) {
      onMessage({ text: `Couldn't ${what}: ${errorText(e)}`, isError: true })
    }
  }

  const newPlaylist = (fileNames: readonly string[] = []) => {
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
      onDone: name => {
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
        })
      },
    })
  }

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
  const openPicker = (button: View | null) => {
    const pick = async (x: number, y: number) => {
      const names = state.playlists.map(p => p.name)
      const items = ['Library', NEW, ...(names.length ? ['-', ...names] : [])]
      const checkedIndex =
        state.activeId === null
          ? 0
          : 3 + state.playlists.findIndex(p => p.id === state.activeId)
      const chosen = await showMenu(items, checkedIndex, x, y)
      if (chosen === 0) {
        run('show the library', () => {
          playlists.show(null)
        })
      } else if (chosen === 1) {
        newPlaylist()
      } else if (chosen >= 3 && chosen < 3 + names.length) {
        const id = state.playlists[chosen - 3]?.id
        if (id !== undefined) {
          run('show the playlist', () => {
            playlists.show(id)
          })
        }
      }
    }
    menuPoint(button, (x, y) => {
      void pick(x, y)
    })
  }

  /** The ⋯ menu beside the picker: what to do with the playlist showing. */
  const openActions = (button: View | null) => {
    const pick = async (x: number, y: number) => {
      if (!active) {
        return
      }
      const actions: Array<readonly [string, () => void]> = [
        [
          'Rename Playlist…',
          () => {
            setPrompt({
              kind: 'name',
              title: 'Rename playlist',
              value: active.name,
              onDone: name => {
                run('rename the playlist', () => {
                  playlists.rename(active.id, name)
                })
              },
            })
          },
        ],
        [
          'Duplicate Playlist',
          () => {
            run('duplicate the playlist', () => playlists.duplicate(active.id))
          },
        ],
        [
          'Export as .m3u8…',
          () => {
            void exportM3u8(active.id, active.name)
          },
        ],
      ]
      const deleteAction = [
        'Delete Playlist…',
        () => {
          setPrompt({
            kind: 'confirm',
            title: `Delete “${active.name}”?`,
            body: 'The recordings stay in your library.',
            action: 'Delete',
            onDone: () => {
              run('delete the playlist', () => {
                playlists.delete(active.id)
              })
            },
          })
        },
      ] as const
      // A separator before Delete.
      const items = [...actions.map(a => a[0]), '-', deleteAction[0]]
      const chosen = await showMenu(items, -1, x, y)
      if (chosen >= 0 && chosen < 3) {
        actions[chosen]?.[1]()
      } else if (chosen === 4) {
        deleteAction[1]()
      }
    }
    menuPoint(button, (x, y) => {
      void pick(x, y)
    })
  }

  /** Adds checked recordings to a playlist chosen from a menu. */
  const openAddTo = (fileNames: readonly string[], button: View | null) => {
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
      if (target) {
        addToPlaylist(target.id, target.name, fileNames)
      }
    }
    menuPoint(button, (x, y) => {
      void show(x, y)
    })
  }

  const addToPlaylist = (
    id: number,
    name: string,
    fileNames: readonly string[],
  ) => {
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
  }

  return { active, openPicker, openActions, openAddTo }
}

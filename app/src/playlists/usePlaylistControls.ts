// The library's playlist picker, its menu actions and in-panel prompts, the
// "Add to ▾" action for checked rows, and the CD capacity bar
// (docs/playlists-and-cd-burning-design.md §5).
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useRef,
  useState,
} from 'react'
import type { View } from 'react-native'

import { pickSaveFile } from '@/native/pickSaveFile'
import { playlistsApi } from '@/native/playlistsApi'
import type { Playlist } from '@/native/types'
import { errorText } from '@/utils/errorText'

import { playlists, type PlaylistsState } from './playlists'
import type { ShowCheckedMenu } from './types'

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
      fileNames: readonly string[]
      already: number
    }

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

export type UsePlaylistControlsProps = {
  readonly state: PlaylistsState
  readonly showMenu: ShowCheckedMenu
  readonly textStyle: object
  readonly onMessage: (m: { text: string; isError: boolean }) => void
}

export type UsePlaylistControlsResult = {
  readonly prompt: Prompt | null
  readonly setPrompt: Dispatch<SetStateAction<Prompt | null>>
  readonly picker: RefObject<View | null>
  readonly actionsButton: RefObject<View | null>
  readonly addTo: RefObject<View | null>
  /** The playlist showing, if any. */
  readonly active: Playlist | undefined
  readonly openPicker: () => void
  readonly openActions: () => void
  readonly openAddTo: (
    fileNames: readonly string[],
    at?: { x: number; y: number },
  ) => void
  readonly addToPlaylist: (
    id: number,
    name: string,
    fileNames: readonly string[],
  ) => void
}

export const usePlaylistControls = (
  props: UsePlaylistControlsProps,
): UsePlaylistControlsResult => {
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
  const openPicker = () => {
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
    menuPoint(picker.current, (x, y) => {
      void pick(x, y)
    })
  }

  /** The ⋯ menu beside the picker: what to do with the playlist showing. */
  const openActions = () => {
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
    menuPoint(actionsButton.current, (x, y) => {
      void pick(x, y)
    })
  }

  /** Adds checked recordings to a playlist chosen from a menu. */
  const openAddTo = (
    fileNames: readonly string[],
    at?: { x: number; y: number },
  ) => {
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
    if (at) {
      void show(at.x, at.y)
    } else {
      menuPoint(addTo.current, (x, y) => {
        void show(x, y)
      })
    }
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

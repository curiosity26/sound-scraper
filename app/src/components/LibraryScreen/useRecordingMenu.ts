// Right-click on a row: the details menu for it (or for every checked row
// when it's one of them), plus Remove from Playlist in a playlist.
import { openRecordingMenu } from '@/library/openRecordingMenu'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import { library } from '@/native/library'
import type { Recording } from '@/native/types'
import { playlists } from '@/playlists/playlists'
import type { PlaylistRow, ShowCheckedMenu } from '@/playlists/types'
import { errorText } from '@/utils/errorText'

import type { OnMessage, RowTarget } from './types'

export type UseRecordingMenuProps = {
  readonly recordings: readonly Recording[]
  /** Native pop-up menus; without them there's no row menu. */
  readonly showLibraryMenu: ShowCheckedMenu | undefined
  readonly showing: boolean
  /** The showing playlist's rows. */
  readonly rows: readonly PlaylistRow[]
  readonly checked: Set<string>
  readonly clearChecked: () => void
  readonly onMessage: OnMessage
}

export type UseRecordingMenuResult = {
  /** Opens the menu for a right-clicked row at (x, y); undefined without
   * menus. */
  readonly openRowMenu:
    | ((target: RowTarget, x: number, y: number) => void)
    | undefined
}

export const useRecordingMenu = (
  props: UseRecordingMenuProps,
): UseRecordingMenuResult => {
  const {
    recordings,
    showLibraryMenu,
    showing,
    rows,
    checked,
    clearChecked,
    onMessage,
  } = props

  const contextMenu = async (
    show: ShowCheckedMenu,
    target: RowTarget,
    x: number,
    y: number,
  ) => {
    const many = checked.has(target.key) && checked.size > 1
    let fileNames: string[]
    let itemIds: number[] = []
    if (showing) {
      const picked = many
        ? rows.filter(r => checked.has(`#${r.item.id}`))
        : rows.filter(r => r.item.id === target.itemId)
      itemIds = picked.map(r => r.item.id)
      fileNames = [
        ...new Set(picked.filter(r => r.recording).map(r => r.item.fileName)),
      ]
    } else {
      fileNames = many ? [...checked] : [target.fileName]
    }
    if (!many && fileNames.length === 1) {
      selection.set(fileNames)
    }
    const showMenu = (items: string[], mx: number, my: number) =>
      show(items, -1, mx, my)
    const remove =
      itemIds.length > 0
        ? [
            {
              label:
                itemIds.length > 1
                  ? `Remove ${itemIds.length} from Playlist`
                  : 'Remove from Playlist',
              run: () => {
                try {
                  playlists.remove(itemIds)
                  clearChecked()
                } catch (e) {
                  onMessage({ text: errorText(e), isError: true })
                }
              },
            },
          ]
        : []
    if (fileNames.length === 0) {
      // Only missing rows: nothing to act on but the playlist.
      const chosen = await showMenu(
        remove.map(a => a.label),
        x,
        y,
      )
      remove[chosen]?.run()
      return
    }
    let hasCover = false
    try {
      const tags = await Promise.all(fileNames.map(n => library.readTags(n)))
      hasCover = tags.some(tag => tag.coverPath !== null)
    } catch {
      // Offer what doesn't need the tags.
    }
    void openRecordingMenu(
      {
        fileNames,
        recordings: recordings.filter(r => fileNames.includes(r.fileName)),
        hasCover,
        showMenu,
        onChanged: refreshLibraryViews,
        onTrashed: clearChecked,
        report: onMessage,
        extra: remove,
      },
      x,
      y,
    )
  }

  return {
    openRowMenu: showLibraryMenu
      ? (target, x, y) => {
          void contextMenu(showLibraryMenu, target, x, y)
        }
      : undefined,
  }
}

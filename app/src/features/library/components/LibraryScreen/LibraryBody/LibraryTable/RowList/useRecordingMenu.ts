// Right-click on a row: the details menu for it (or for every checked row
// when it's one of them), plus Remove from Playlist in a playlist.
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { library } from '@/features/library/library'
import { openRecordingMenu } from '@/features/library/openRecordingMenu'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { selection } from '@/features/library/selection'
import { playlists } from '@/features/playlists/playlists'
import type { ShowCheckedMenu } from '@/features/playlists/types'
import { errorText } from '@/shared/utils/errorText'

import type { RowTarget } from './types'

export type UseRecordingMenuResult = {
  /** Opens the menu for a right-clicked row at (x, y); undefined without
   * the screen's native menus. */
  readonly openRowMenu:
    | ((target: RowTarget, x: number, y: number) => void)
    | undefined
}

export const useRecordingMenu = (): UseRecordingMenuResult => {
  const { showLibraryMenu, onMessage } = useLibraryScreen()
  const { recordings, shown, checks } = useLibraryView()
  const { showing, rows } = shown
  const { checked, clear: clearChecked } = checks

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

// Clicks on a row: a press shows it (in the details, or selects the
// playlist item); a right-click opens the same menu as the details panel's
// gear.
import { type RefObject, useRef } from 'react'

import { rowKey } from '@/components/LibraryScreen/LibraryBody/LibraryTable/rowKey'
import { showDetails } from '@/components/LibraryScreen/LibraryBody/showDetails'
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import type { Row } from '@/library/types'
import { playlists } from '@/playlists/playlists'

import type { AuxClick, MouseLike } from './types'
import { useRecordingMenu } from './useRecordingMenu'

export type UseRowClicksProps = {
  /** Where the list box sits in the window. */
  readonly boxAt: RefObject<{ x: number; y: number }>
  /** A row's height. */
  readonly rowHeight: RefObject<number>
  /** The list's scroll offset. */
  readonly scrollOffset: number
}

export type UseRowClicksResult = {
  readonly press: (row: Row) => void
  /** A press or pointer event, which may be a right-click. */
  readonly rightClick: (row: Row, e: MouseLike) => void
  /** macOS: an aux click on the row at `index`, in the row's coordinates. */
  readonly auxClick: (row: Row, index: number, e: AuxClick) => void
}

export const useRowClicks = (props: UseRowClicksProps): UseRowClicksResult => {
  const { boxAt, rowHeight, scrollOffset } = props
  const { openDetails } = useLibraryScreen()
  const playlist = useLibraryView().shown.view
  const { openRowMenu } = useRecordingMenu()

  // Both the press and (on Windows) the pointer event may report a
  // right-click; show the menu once.
  const lastMenu = useRef(0)
  const rightClick = (row: Row, e: MouseLike) => {
    if (e.button !== 2 || !openRowMenu) {
      return
    }
    if (Date.now() - lastMenu.current < 600) {
      return
    }
    lastMenu.current = Date.now()
    openRowMenu(
      { fileName: row.fileName, itemId: row.itemId, key: rowKey(row) },
      e.pageX ?? 0,
      e.pageY ?? 0,
    )
  }

  return {
    press: row => {
      if (!row.recording || Date.now() - lastMenu.current < 600) {
        return
      }
      if (playlist) {
        const source = playlist.rows.find(p => p.item.id === row.itemId)
        if (source) {
          playlist.onSelectItem(source)
        }
      } else {
        playlists.setPlaying(null)
        showDetails([row.fileName], openDetails)
      }
    },
    rightClick,
    auxClick: (row, index, e) => {
      rightClick(row, {
        button: e.button ?? 2,
        pageX: boxAt.current.x + (e.clientX ?? 0),
        pageY:
          boxAt.current.y +
          index * rowHeight.current -
          scrollOffset +
          (e.clientY ?? 0),
      })
    },
  }
}

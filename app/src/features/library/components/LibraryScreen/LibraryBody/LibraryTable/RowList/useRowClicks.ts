// Clicks on a row: a press shows it (in the details, or selects the
// playlist item, and in the track editor when that's open); a double-click
// plays it; a right-click opens the same menu as the details panel's gear.
import { type RefObject, useRef } from 'react'

import { rowKey } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/rowKey'
import { showDetails } from '@/features/library/components/LibraryScreen/LibraryBody/showDetails'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { followInEditor } from '@/features/library/followInEditor'
import type { Row } from '@/features/library/types'
import { playback } from '@/features/playback/playback'
import { playlists } from '@/features/playlists/playlists'
import { errorText } from '@/shared/utils/errorText'

import { auxClickPoint } from './auxClickPoint'
import { DOUBLE_CLICK_MS } from './constants'
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

// playback reports a failed load or play itself, so this only sees
// something throwing past that: dev console.
const warnPlayFailed = (e: unknown) => {
  console.warn(`Playing the double-clicked row failed: ${errorText(e)}`)
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

  // The last press, to tell a double-click (a second press on the same row
  // soon after) from two clicks.
  const lastPress = useRef({ key: '', at: 0 })

  return {
    press: row => {
      const recording = row.recording
      if (!recording || Date.now() - lastMenu.current < 600) {
        return
      }
      const key = rowKey(row)
      const now = Date.now()
      const last = lastPress.current
      const double = last.key === key && now - last.at < DOUBLE_CLICK_MS
      // A third press starts a new double-click.
      lastPress.current = double ? { key: '', at: 0 } : { key, at: now }
      if (playlist) {
        const source = playlist.rows.find(p => p.item.id === row.itemId)
        if (source) {
          playlist.onSelectItem(source)
        }
      } else {
        playlists.setPlaying(null)
        showDetails([row.fileName], openDetails)
      }
      followInEditor(recording)
      if (double) {
        playback.selectAndPlay(recording).catch(warnPlayFailed)
      }
    },
    rightClick,
    auxClick: (row, index, e) => {
      rightClick(row, {
        button: e.button ?? 2,
        ...auxClickPoint(
          e,
          boxAt.current,
          index * rowHeight.current - scrollOffset,
        ),
      })
    },
  }
}

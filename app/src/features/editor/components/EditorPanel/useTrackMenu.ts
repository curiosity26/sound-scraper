// Right-click on a track: Edit Metadata… (the tag form, on the selection
// when the track is part of one) and Delete Track, or Restore Track when
// its audio is already wholly deleted. The deletion is a deleted stretch
// like any other, so it undoes and is kept in the draft.
import type { ShowMenu } from '@/features/library/types'
import { errorText } from '@/shared/utils/errorText'

import { deleteRegion, isRangeDeleted, restoreRange } from './model'
import type { UseEditHistoryResult } from './useEditHistory'
import type { UseEditorSelectionResult } from './useEditorSelection'
import type { UseEditorTracksResult } from './useEditorTracks'

export type UseTrackMenuOptions = {
  /** The window's native context menu; none, no menu. */
  readonly showMenu: ShowMenu | undefined
  readonly history: UseEditHistoryResult
  readonly tracks: UseEditorTracksResult
  readonly selection: UseEditorSelectionResult
  /** Opens the tag form on the track, or on the selection it's part of. */
  readonly editTrackTags: (index: number) => void
}

export type UseTrackMenuResult = {
  /** Opens the menu for the track at `index`, at (x, y) in the window. */
  readonly open: (index: number, x: number, y: number) => void
}

// Nothing the editor can do about a menu that didn't show: dev console.
const warnMenuFailed = (e: unknown) => {
  console.warn(`The track menu failed: ${errorText(e)}`)
}

export const useTrackMenu = (
  options: UseTrackMenuOptions,
): UseTrackMenuResult => {
  const { showMenu, history, tracks, selection } = options

  const show = async (menu: ShowMenu, index: number, x: number, y: number) => {
    const { selectedTracks } = selection
    const picked =
      selectedTracks.length > 1 && selectedTracks.includes(index)
        ? selectedTracks
        : [index]
    const ranges = picked.flatMap(i => {
      const row = tracks.rows[i]
      return row ? [{ start: row.startMs, end: tracks.trackEnd(i) }] : []
    })
    const restore = ranges.every(r =>
      isRangeDeleted(history.edits, r.start, r.end),
    )
    const what = picked.length > 1 ? `${String(picked.length)} Tracks` : 'Track'
    const chosen = await menu(
      ['Edit Metadata…', '-', restore ? `Restore ${what}` : `Delete ${what}`],
      x,
      y,
    )
    if (chosen === 0) {
      options.editTrackTags(index)
    } else if (chosen === 2) {
      history.commitWith(e =>
        ranges.reduce(
          (next, r) =>
            restore
              ? restoreRange(next, r.start, r.end)
              : deleteRegion(next, r.start, r.end),
          e,
        ),
      )
    }
  }

  return {
    open: (index, x, y) => {
      if (showMenu) {
        show(showMenu, index, x, y).catch(warnMenuFailed)
      }
    },
  }
}

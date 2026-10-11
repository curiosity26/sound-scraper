import React, { type FC } from 'react'

import { ToolbarLink } from '@/components/LibraryScreen/LibraryBody/LibraryTable/TableToolbar/ToolbarLink'
import { useLibraryTable } from '@/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/components/LibraryScreen/LibraryBody/useLibraryView'

import { moveBy } from './moveBy'

/** In a playlist, for the checked rows: Remove, and ▲ ▼ while the rows
 * can be reordered. */
export const PlaylistItemActions: FC = () => {
  const { shown, checks: checkedRows } = useLibraryView()
  const { checks, canReorder, order } = useLibraryTable()
  const playlist = shown.view
  const { checkedItemIds } = checks
  if (!playlist || checkedItemIds.length === 0) {
    return null
  }
  return (
    <>
      <ToolbarLink
        id="playlist-remove"
        label="Remove"
        onPress={() => {
          playlist.onRemove(checkedItemIds)
          checkedRows.setChecked(new Set())
        }}
      />
      {canReorder && (
        <>
          <ToolbarLink
            id="playlist-move-up"
            label="▲"
            accessibilityLabel="Move up"
            onPress={() => {
              playlist.onReorder(moveBy(order, checkedItemIds, -1))
            }}
          />
          <ToolbarLink
            id="playlist-move-down"
            label="▼"
            accessibilityLabel="Move down"
            onPress={() => {
              playlist.onReorder(moveBy(order, checkedItemIds, 1))
            }}
          />
        </>
      )}
    </>
  )
}

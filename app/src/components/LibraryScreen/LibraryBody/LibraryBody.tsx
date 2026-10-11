import React, { type FC, use, useEffect, useState } from 'react'

import { useLibraryScreen } from '@/components/LibraryScreen/useLibraryScreen'
import { usePlaylists } from '@/hooks/usePlaylists'
import type { Recording } from '@/native/types'

import { AddRecordingsSheet } from './AddRecordingsSheet'
import { AddToButton } from './AddToButton'
import { CapacityBar } from './CapacityBar'
import { LibraryTable } from './LibraryTable'
import { LibraryViewContext } from './LibraryViewContext'
import { PlaylistPrompt } from './PlaylistPrompt'
import { PlaylistPromptProvider } from './PlaylistPromptProvider'
import { PlaylistToolbar } from './PlaylistToolbar'
import { SideDetails } from './SideDetails'
import { useCheckedRows } from './useCheckedRows'
import { usePlaybackFollow } from './usePlaybackFollow'
import { useShownPlaylist } from './useShownPlaylist'

export type LibraryBodyProps = {
  /** The library's recordings (read with use(), under LibraryScreen's
   * boundary). */
  readonly recordings: Promise<readonly Recording[]>
}

/**
 * What LibraryScreen shows once the library is read. It owns what its parts
 * share (the playlist showing, the checked rows) and hands it to them in
 * LibraryViewContext.
 */
export const LibraryBody: FC<LibraryBodyProps> = props => {
  const { onCount, showLibraryMenu } = useLibraryScreen()
  const recordings = use(props.recordings)
  const playlistsState = usePlaylists()
  const [adding, setAdding] = useState(false)

  const shown = useShownPlaylist({ recordings, state: playlistsState })
  const { showing, activeName, rows } = shown
  const checks = useCheckedRows({
    recordings,
    activeId: playlistsState.activeId,
    showing,
    rows,
  })
  usePlaybackFollow({ recordings, onAdvance: shown.selectItem })

  useEffect(() => {
    onCount?.(
      showing ? rows.length : recordings.length,
      showing ? activeName : undefined,
    )
  }, [recordings.length, rows.length, showing, activeName, onCount])

  return (
    <LibraryViewContext value={{ recordings, playlistsState, shown, checks }}>
      <PlaylistPromptProvider>
        <LibraryTable
          toolbarStart={
            showLibraryMenu ? (
              <PlaylistToolbar
                onAddRecordings={() => {
                  setAdding(true)
                }}
              />
            ) : undefined
          }
          checkedActions={showLibraryMenu ? <AddToButton /> : undefined}
          footer={showing ? <CapacityBar /> : undefined}
        />
        <SideDetails />
        {showLibraryMenu && <PlaylistPrompt />}
        {adding && showing && (
          <AddRecordingsSheet
            onClose={() => {
              setAdding(false)
            }}
          />
        )}
      </PlaylistPromptProvider>
    </LibraryViewContext>
  )
}

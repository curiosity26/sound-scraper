import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { AsyncBoundary } from '@/components/AsyncBoundary'
import type { ShowMenu } from '@/library/types'
import type { ShowCheckedMenu } from '@/playlists/types'

import { LibraryBody } from './LibraryBody'
import type { BurnTarget, OnMessage } from './types'
import { useRecordingList } from './useRecordingList'

export type LibraryScreenProps = {
  readonly onMessage: OnMessage
  readonly textStyle: object
  readonly isDark: boolean
  /** Skinned panel: no heading (see LibraryTable). */
  readonly compact?: boolean
  /** Reports how many rows there are and what's showing (for a title). */
  readonly onCount?: (count: number, playlistName?: string) => void
  /**
   * Shows the selection in a separate details window (the skinned UI);
   * without it, the details pane sits beside the table.
   */
  readonly openDetails?: () => void
  /** Native menus for the details pane's gear (side-pane mode). */
  readonly showMenu?: ShowMenu
  /**
   * Native pop-up menus in the library panel; with it, the playlist picker
   * and "Add to ▾" are shown.
   */
  readonly showLibraryMenu?: ShowCheckedMenu
  /** Burn CD… / Save CD Image… for the playlist showing. */
  readonly onBurn?: (target: BurnTarget) => void
}

/** The recordings table with rename/trash/reveal and the tag editor. */
export const LibraryScreen: FC<LibraryScreenProps> = props => {
  const { recordings, retry } = useRecordingList(props.onMessage)
  return (
    <View style={styles.libraryRow}>
      <AsyncBoundary
        what="read the library"
        resetKeys={[recordings]}
        onReset={retry}
      >
        <LibraryBody {...props} recordings={recordings} />
      </AsyncBoundary>
    </View>
  )
}

const styles = StyleSheet.create({
  libraryRow: { flex: 1, flexDirection: 'row' },
})

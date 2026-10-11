import React, { type FC, use, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { DetailsPane } from '@/components/DetailsPane'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { usePlayback } from '@/hooks/usePlayback'
import { usePlaylists } from '@/hooks/usePlaylists'
import { useSelection } from '@/hooks/useSelection'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import type { Recording } from '@/native/types'
import { playback } from '@/playback/playback'
import { playlists } from '@/playlists/playlists'

import { AddRecordingsSheet } from './AddRecordingsSheet'
import { AddToButton } from './AddToButton'
import { BurnButton } from './BurnButton'
import { CapacityBar } from './CapacityBar'
import type { LibraryScreenProps } from './LibraryScreen'
import { LibraryTable } from './LibraryTable'
import { PlaylistActionsButton } from './PlaylistActionsButton'
import { PlaylistPicker } from './PlaylistPicker'
import { PlaylistPrompt } from './PlaylistPrompt'
import { useCheckedRows } from './useCheckedRows'
import { usePlaybackFollow } from './usePlaybackFollow'
import { usePlaylistControls } from './usePlaylistControls'
import { useRecordingMenu } from './useRecordingMenu'
import { useShownPlaylist } from './useShownPlaylist'

export type LibraryBodyProps = LibraryScreenProps & {
  /** The library's recordings (read with use(), under LibraryScreen's
   * boundary). */
  readonly recordings: Promise<readonly Recording[]>
}

/** What LibraryScreen shows once the library is read. */
export const LibraryBody: FC<LibraryBodyProps> = props => {
  const { onMessage, textStyle, isDark, onCount, showLibraryMenu, onBurn } =
    props
  const recordings = use(props.recordings)
  const selected = useSelection().fileNames
  const loaded = usePlayback().fileName
  const pl = usePlaylists()
  const [adding, setAdding] = useState(false)
  const t = usePanelStyles()

  const show = (fileNames: string[]) => {
    selection.set(fileNames)
    props.openDetails?.()
  }

  const playlist = useShownPlaylist({
    recordings,
    state: pl,
    enabled: showLibraryMenu !== undefined,
    onShow: show,
    onMessage,
  })
  const { showing, activeName, rows, capacity } = playlist
  const checks = useCheckedRows({
    recordings,
    activeId: pl.activeId,
    showing,
    rows,
  })
  usePlaybackFollow({ recordings, selected, onAdvance: playlist.selectItem })
  const menu = useRecordingMenu({
    recordings,
    showLibraryMenu,
    showing,
    rows,
    checked: checks.checked,
    clearChecked: checks.clear,
    onMessage,
  })
  const controls = usePlaylistControls({
    state: pl,
    showMenu: showLibraryMenu ?? (() => Promise.resolve(-1)),
    textStyle,
    onMessage,
  })

  useEffect(() => {
    onCount?.(
      showing ? rows.length : recordings.length,
      showing ? activeName : undefined,
    )
  }, [recordings.length, rows.length, showing, activeName, onCount])

  return (
    <>
      <LibraryTable
        recordings={recordings}
        selected={selected.length === 1 ? selected[0] : undefined}
        loaded={loaded}
        onSelect={name => {
          playlists.setPlaying(null)
          show([name])
        }}
        onEditTags={show}
        checked={checks.checked}
        onCheckedChange={checks.setChecked}
        textStyle={textStyle}
        isDark={isDark}
        compact={props.compact}
        playlist={playlist.view}
        onContextMenu={menu.openRowMenu}
        toolbarStart={
          showLibraryMenu ? (
            <>
              <PlaylistPicker controls={controls} textStyle={textStyle} />
              <PlaylistActionsButton
                controls={controls}
                textStyle={textStyle}
              />
              {showing && (
                <Pressable
                  testID="playlist-add-recordings"
                  onPress={() => {
                    setAdding(true)
                  }}
                >
                  <Text style={[styles.link, t.link, t.cell]}>
                    + Add Recordings…
                  </Text>
                </Pressable>
              )}
            </>
          ) : undefined
        }
        checkedActions={
          showLibraryMenu ? (
            <AddToButton controls={controls} fileNames={checks.checkedNames} />
          ) : undefined
        }
        footer={
          showing ? (
            <CapacityBar
              capacity={capacity}
              textStyle={textStyle}
              action={
                onBurn ? (
                  <BurnButton
                    capacity={capacity}
                    onPress={() => {
                      const target = playlist.burnTarget()
                      if (target) {
                        onBurn(target)
                      }
                    }}
                  />
                ) : undefined
              }
            />
          ) : undefined
        }
      />
      {!props.openDetails && selected.length > 0 && (
        <View style={styles.pane}>
          <DetailsPane
            fileNames={selected}
            onRenamed={(old, renamed) => {
              playback.renamed(old, renamed)
              selection.set([renamed])
            }}
            onChanged={refreshLibraryViews}
            onClose={() => {
              selection.set([])
            }}
            showMenu={props.showMenu}
            textStyle={textStyle}
            isDark={isDark}
          />
        </View>
      )}
      {showLibraryMenu && (
        <PlaylistPrompt
          controls={controls}
          textStyle={textStyle}
          onMessage={onMessage}
        />
      )}
      {adding && showing && (
        <AddRecordingsSheet
          playlistName={activeName ?? 'Playlist'}
          recordings={recordings}
          already={new Set(pl.items.map(i => i.fileName))}
          textStyle={textStyle}
          onCancel={() => {
            setAdding(false)
          }}
          onAdd={names => {
            setAdding(false)
            playlist.addRecordings(names)
          }}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  pane: { width: 300, marginLeft: 16 },
  link: { fontSize: 13 },
})

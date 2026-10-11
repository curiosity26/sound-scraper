// Playback follows the library: a selected recording loads, a vanished one
// unloads, and a playlist plays on from one track to the next.
import { useEffect } from 'react'

import { selection } from '@/library/selection'
import type { Recording } from '@/native/types'
import { playback } from '@/playback/playback'
import { playlists } from '@/playlists/playlists'

import { playlistRows } from './playlistRows'

export type UsePlaybackFollowProps = {
  readonly recordings: readonly Recording[]
  /** The selected recordings' file names. */
  readonly selected: readonly string[]
  /** Autoplay moved on to this playlist row (stable: it's an effect's
   * dependency). */
  readonly onAdvance: (itemId: number) => void
}

export const usePlaybackFollow = (props: UsePlaybackFollowProps): void => {
  const { recordings, selected, onAdvance } = props

  // The loaded recording was trashed (or moved away).
  useEffect(() => {
    const names = new Set(recordings.map(r => r.fileName))
    const p = playback.get()
    if (p.fileName && !names.has(p.fileName)) {
      playback.clear()
    }
  }, [recordings])

  // Selecting one recording loads it for playback.
  useEffect(() => {
    if (selected.length !== 1) {
      return
    }
    const recording = recordings.find(r => r.fileName === selected[0])
    if (recording) {
      void playback.select(recording)
    }
  }, [selected, recordings])

  // In a playlist, playing on: when a track ends, the next one plays.
  useEffect(
    () =>
      playback.onEnded(fileName => {
        const s = playlists.get()
        if (s.activeId === null || s.playingItemId === null) {
          return
        }
        const all = playlistRows(s.items, recordings)
        const at = all.findIndex(r => r.item.id === s.playingItemId)
        if (at < 0 || all[at]?.item.fileName !== fileName) {
          return
        }
        const next = all.slice(at + 1).find(r => r.recording)
        const nextRecording = next?.recording
        if (!next || !nextRecording) {
          return
        }
        playlists.setPlaying(next.item.id)
        onAdvance(next.item.id)
        selection.set([next.item.fileName])
        playback
          .select(nextRecording)
          .then(() => playback.play())
          .catch(() => {})
      }),
    [recordings, onAdvance],
  )
}

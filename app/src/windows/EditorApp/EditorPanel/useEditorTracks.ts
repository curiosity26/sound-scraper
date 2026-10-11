// The tracks the edits make, as the native editor works them out, each
// with who names it.
import { useMemo } from 'react'

import { editorCore } from '@/native/editorCore'
import type { TrackInfo } from '@/native/types'

import { type Edits, editsToJson } from './model'
import type { TrackRow } from './types'

export type UseEditorTracksResult = {
  readonly tracks: readonly TrackInfo[]
  /** Each track with who names it (its slice, or the first track). */
  readonly rows: readonly TrackRow[]
  /** How many tracks saving re-encodes (none from a master). */
  readonly reencoded: number
  /** Where a track ends: the next one's start, or the end. */
  readonly trackEnd: (index: number) => number
}

export type UseEditorTracksOptions = {
  readonly editorId: number
  readonly ready: boolean
  readonly hasMaster: boolean
  readonly durationMs: number
  /** The edits as shown (with a dragged slice where it is now). */
  readonly shown: Edits
}

export const useEditorTracks = (
  options: UseEditorTracksOptions,
): UseEditorTracksResult => {
  const { editorId, ready, shown } = options
  const tracks: TrackInfo[] = useMemo(
    () => (ready ? editorCore.tracks(editorId, editsToJson(shown)) : []),
    [ready, editorId, shown],
  )
  /** Each track with who names it (its slice, or the first track). */
  const rows: TrackRow[] = useMemo(
    () =>
      tracks.map(tr => {
        const slice =
          tr.startMs < 1
            ? undefined
            : shown.splices.find(s => Math.abs(s.atMs - tr.startMs) < 1)
        return {
          ...tr,
          owner: slice ? slice.id : tr.startMs < 1 ? 'first' : null,
          name: slice ? slice.name : tr.startMs < 1 ? shown.firstName : tr.name,
        }
      }),
    [tracks, shown],
  )
  return {
    tracks,
    rows,
    reencoded: options.hasMaster ? 0 : tracks.filter(tr => tr.reencode).length,
    trackEnd: i => rows[i + 1]?.startMs ?? options.durationMs,
  }
}

// The track editor's model (docs/track-editor-design.md §4): the edit list
// and its changes, undo, and the ruler/zoom/snap arithmetic. Pure: no
// native side.
import type { TrackTags } from '@/bridge/generated'

export type Splice = {
  id: number
  atMs: number
  name: string
  /** The track's own tags, over the recording's. */
  tags?: TrackTags
}
export type Region = { id: number; startMs: number; endMs: number }

export type Edits = {
  /** The name of the first track (starting at 0). */
  firstName: string
  /** The first track's own tags, over the recording's. */
  firstTags?: TrackTags
  splices: Splice[]
  deleted: Region[]
}

/** Who a track belongs to: its splice (by id), or the first track. */
export type TrackOwner = number | 'first'

export type History = { past: Edits[]; present: Edits; future: Edits[] }

/** A splice Find Tracks proposes (see editorCore.ts). */
export type ProposedSplice = {
  atMs: number
  delete: [number, number] | null
}

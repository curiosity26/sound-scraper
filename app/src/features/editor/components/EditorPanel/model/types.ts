// The track editor's model (docs/track-editor-design.md §4): the edit list
// and its changes, undo, and the ruler/zoom/snap arithmetic. Pure: no
// native side.

export type Splice = { id: number; atMs: number; name: string }
export type Region = { id: number; startMs: number; endMs: number }

export type Edits = {
  /** The name of the first track (starting at 0). */
  firstName: string
  splices: Splice[]
  deleted: Region[]
}

export type History = { past: Edits[]; present: Edits; future: Edits[] }

/** A splice Find Tracks proposes (see editorCore.ts). */
export type ProposedSplice = {
  atMs: number
  delete: [number, number] | null
}

// The track editor's native module (src/bridge/NativeEditor.ts), faked: the
// drafts it keeps per recording, and the recordings it can open (read at
// once, from a lossless master), working out the tracks an edit list makes
// as the core does, and the slices Find Tracks proposes (as a test sets). Tests replace the module with this one:
//
//   vi.mock('@/bridge/NativeEditor', () => import('@test/fakes/NativeEditor'))
//
// and arrange or inspect it through `fakeEditor`. Call `fakeEditor.reset()`
// in a beforeEach.
import { vi } from 'vitest'

import type {
  EditList,
  EditorTrack,
  Proposal,
  WaveformStatus,
} from '@/bridge/generated'
import type { Spec } from '@/bridge/NativeEditor'
import { parseNative } from '@/bridge/parseNative'
import { isEditList } from '@/features/editor/guards/isEditList'

type State = {
  drafts: Record<string, string>
  /** The length of each recording that opens, by path. */
  recordings: Record<string, number>
  /** The recording each open editor is on, by editor id. */
  open: Record<number, string>
  /** What Find Tracks proposes, whatever its settings. */
  proposals: readonly Proposal[]
  nextId: number
}

const initialState = (): State => ({
  drafts: {},
  recordings: {},
  open: {},
  proposals: [],
  nextId: 1,
})

const state: State = initialState()

const durationOf = (id: number) => {
  const path = state.open[id]
  const durationMs = path === undefined ? undefined : state.recordings[path]
  if (durationMs === undefined) {
    throw new Error(`No editor ${id}`)
  }
  return durationMs
}

const overlap = (start: number, end: number, edits: EditList) =>
  edits.deleted.reduce(
    (sum, r) =>
      sum + Math.max(0, Math.min(end, r.endMs) - Math.max(start, r.startMs)),
    0,
  )

/** The tracks an edit list makes: one per splice, after the first. */
const tracksOf = (durationMs: number, edits: EditList): EditorTrack[] => {
  const starts = [
    { atMs: 0, name: edits.firstName },
    ...edits.splices.toSorted((a, b) => a.atMs - b.atMs),
  ]
  return starts.map((s, i) => {
    const end = starts[i + 1]?.atMs ?? durationMs
    const cut = overlap(s.atMs, end, edits)
    return {
      name: s.name,
      startMs: s.atMs,
      durationMs: end - s.atMs - cut,
      reencode: cut > 0,
    }
  })
}

const native = {
  open: vi.fn((path: string): number => {
    if (state.recordings[path] === undefined) {
      return 0
    }
    const id = state.nextId++
    state.open = { ...state.open, [id]: path }
    return id
  }),
  close: vi.fn((id: number) => {
    const { [id]: _, ...rest } = state.open
    state.open = rest
  }),
  status: vi.fn((id: number): string => {
    const status: WaveformStatus = {
      state: 'ready',
      rate: 44_100,
      durationMs: durationOf(id),
      frameMs: null,
      frameOffsetMs: null,
      master: true,
    }
    return JSON.stringify(status)
  }),
  tracks: vi.fn((id: number, editsJson: string): string =>
    JSON.stringify(
      tracksOf(durationOf(id), parseNative(editsJson, isEditList, 'edits')),
    ),
  ),
  detect: vi.fn((_id: number, _optionsJson: string): string =>
    JSON.stringify(state.proposals),
  ),
  loadDraft: vi.fn((fileName: string) => state.drafts[fileName] ?? 'null'),
  saveDraft: vi.fn((fileName: string, editsJson: string) => {
    state.drafts = { ...state.drafts, [fileName]: editsJson }
  }),
  discardDraft: vi.fn((fileName: string) => {
    const { [fileName]: _, ...rest } = state.drafts
    state.drafts = rest
  }),
  mastersUsage: vi.fn(() => JSON.stringify({ count: 0, bytes: 0 })),
  deleteAllMasters: vi.fn(() => Promise.resolve()),
  save: vi.fn((_fileName: string, _editsJson: string, _keepOriginal: boolean) =>
    Promise.reject(new Error('Not faked')),
  ),
} satisfies Spec

export const NativeEditor = native

/** The test's handle on the fake editor module. */
export const fakeEditor = {
  native,
  reset: () => {
    Object.assign(state, initialState())
    Object.values(native).forEach(fn => {
      fn.mockClear()
    })
  },
  /** Stores the raw draft JSON the core keeps for `fileName`. */
  setDraft: (fileName: string, json: string) => {
    state.drafts = { ...state.drafts, [fileName]: json }
  },
  /** The raw draft JSON kept for `fileName`, if any. */
  draft: (fileName: string): string | undefined => state.drafts[fileName],
  /** What Find Tracks proposes from now on. */
  setProposals: (proposals: readonly Proposal[]) => {
    state.proposals = [...proposals]
  },
  /** Lets the editor open the recording at `path`, `durationMs` long. */
  addRecording: (path: string, durationMs: number) => {
    state.recordings = { ...state.recordings, [path]: durationMs }
  },
}

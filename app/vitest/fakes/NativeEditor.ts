// The track editor's native module (src/bridge/NativeEditor.ts), faked: the
// drafts it keeps per recording. Tests replace the module with this one:
//
//   vi.mock('@/bridge/NativeEditor', () => import('@test/fakes/NativeEditor'))
//
// and arrange or inspect it through `fakeEditor`. Call `fakeEditor.reset()`
// in a beforeEach.
import { vi } from 'vitest'

import type { Spec } from '@/bridge/NativeEditor'

type State = { drafts: Record<string, string> }

const state: State = { drafts: {} }

const notInTests = () => {
  throw new Error('Not faked')
}

const native = {
  open: vi.fn((_path: string): number => notInTests()),
  close: vi.fn((_id: number) => {}),
  status: vi.fn((_id: number): string => notInTests()),
  tracks: vi.fn((_id: number, _editsJson: string): string => notInTests()),
  detect: vi.fn((_id: number, _optionsJson: string): string => notInTests()),
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

export default native

/** The test's handle on the fake editor module. */
export const fakeEditor = {
  native,
  reset: () => {
    state.drafts = {}
    Object.values(native).forEach(fn => {
      fn.mockClear()
    })
  },
  /** Stores the raw draft JSON the core keeps for `fileName`. */
  setDraft: (fileName: string, json: string) => {
    state.drafts = { ...state.drafts, [fileName]: json }
  },
}

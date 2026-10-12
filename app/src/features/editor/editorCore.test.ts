import { beforeEach, describe, expect, it, vi } from 'vitest'

import { editorCore } from '@/features/editor/editorCore'
import { fakeEditor } from '@test/fakes/NativeEditor'

vi.mock('@/bridge/NativeEditor', () => import('@test/fakes/NativeEditor'))

const edits = {
  firstName: 'A',
  splices: [{ atMs: 10, name: 'B' }],
  deleted: [{ startMs: 1, endMs: 2 }],
}

describe("the track editor's drafts", () => {
  beforeEach(() => {
    fakeEditor.reset()
  })

  describe('given a draft was saved for a recording', () => {
    beforeEach(() => {
      editorCore.saveDraft('a.mp3', JSON.stringify(edits))
    })

    describe('when its draft is loaded', () => {
      it('gives back the saved edits', () => {
        expect(editorCore.loadDraft('a.mp3')).toEqual(edits)
      })
    })

    describe('when its draft is discarded and loaded', () => {
      it('finds none', () => {
        editorCore.discardDraft('a.mp3')
        expect(editorCore.loadDraft('a.mp3')).toBeNull()
      })
    })
  })

  describe('given no draft for a recording', () => {
    describe('when its draft is loaded', () => {
      it('finds none', () => {
        expect(editorCore.loadDraft('a.mp3')).toBeNull()
      })
    })
  })

  describe("given a draft that isn't JSON", () => {
    beforeEach(() => {
      fakeEditor.setDraft('a.mp3', '{bad')
    })

    describe('when it is loaded', () => {
      it('counts as no draft', () => {
        expect(editorCore.loadDraft('a.mp3')).toBeNull()
      })
    })
  })

  describe("given a draft that isn't an edit list", () => {
    beforeEach(() => {
      fakeEditor.setDraft(
        'a.mp3',
        '{"firstName":"A","splices":[{"atMs":"x"}],"deleted":[]}',
      )
    })

    describe('when it is loaded', () => {
      it('counts as no draft', () => {
        expect(editorCore.loadDraft('a.mp3')).toBeNull()
      })
    })
  })
})

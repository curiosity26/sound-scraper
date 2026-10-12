import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorPreferencesProvider } from '@/features/editor/components/EditorPreferencesProvider'
import { editorCore } from '@/features/editor/editorCore'
import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { skinStore } from '@/features/skins/skinStore'
import { fakeEditor } from '@test/fakes/NativeEditor'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore, recording } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

import { EditorPanel } from './EditorPanel'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))
vi.mock('@/bridge/NativeEditor', () => import('@test/fakes/NativeEditor'))

const sideA = recording('Side A.mp3', { durationMs: 60_000 })

const draftWithSideB = JSON.stringify({
  firstName: 'Side A',
  splices: [{ atMs: 30_000, name: 'Side B' }],
  deleted: [],
})

const renderEditor = () =>
  render(
    <SkinProvider>
      <EditorPreferencesProvider>
        <EditorPanel
          target={{
            fileName: sideA.fileName,
            path: sideA.path,
            title: sideA.title,
            durationMs: sideA.durationMs,
          }}
          onSaved={() => {}}
        />
      </EditorPreferencesProvider>
    </SkinProvider>,
  )

describe('the track editor', () => {
  beforeEach(() => {
    fakeCore.reset()
    fakeSkins.reset()
    fakeEditor.reset()
    skinStore.set(testSkin())
    fakeCore.setRecordings([sideA])
    fakeEditor.addRecording(sideA.path, sideA.durationMs)
  })

  describe('given a recording with no draft', () => {
    it('shows it as one track named after the recording', async () => {
      await renderEditor()
      expect(screen.getByDisplayValue('Side A')).toBeOnTheScreen()
    })

    it('has nothing to undo', async () => {
      await renderEditor()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    })

    it('has nothing to save', async () => {
      await renderEditor()
      expect(screen.getByRole('button', { name: 'Save…' })).toBeDisabled()
    })
  })

  describe('given a draft with a slice at 0:30 named Side B', () => {
    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, draftWithSideB)
    })

    it("lists the slice's track", async () => {
      await renderEditor()
      expect(screen.getByDisplayValue('Side B')).toBeOnTheScreen()
    })

    it('can be saved', async () => {
      await renderEditor()
      expect(screen.getByRole('button', { name: 'Save…' })).toBeEnabled()
    })

    describe('when Clear All is pressed', () => {
      it('goes back to one track', async () => {
        const user = userEvent.setup()
        await renderEditor()
        await user.press(screen.getByRole('button', { name: 'Clear All' }))
        expect(screen.queryByDisplayValue('Side B')).not.toBeOnTheScreen()
      })
    })

    describe('when Clear All is pressed, then Undo', () => {
      it("lists the slice's track again", async () => {
        const user = userEvent.setup()
        await renderEditor()
        await user.press(screen.getByRole('button', { name: 'Clear All' }))
        await user.press(screen.getByRole('button', { name: 'Undo' }))
        expect(screen.getByDisplayValue('Side B')).toBeOnTheScreen()
      })
    })

    describe('when Clear All is pressed and a moment passes', () => {
      afterEach(() => {
        vi.useRealTimers()
      })

      it('keeps the cleared edits as the draft', async () => {
        vi.useFakeTimers()
        const user = userEvent.setup({
          advanceTimers: ms => {
            vi.advanceTimersByTime(ms)
          },
        })
        await renderEditor()
        await user.press(screen.getByRole('button', { name: 'Clear All' }))
        await vi.advanceTimersByTimeAsync(1000)
        expect(editorCore.loadDraft(sideA.fileName)).toEqual({
          firstName: 'Side A',
          splices: [],
          deleted: [],
        })
      })
    })
  })

  describe("given a draft that doesn't read", () => {
    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, '{bad')
    })

    it('opens with nothing to clear', async () => {
      await renderEditor()
      expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled()
    })
  })
})

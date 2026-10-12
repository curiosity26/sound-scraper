import {
  fireEvent,
  render,
  screen,
  userEvent,
  within,
} from '@testing-library/react-native'
import React, { type FC } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Proposal } from '@/bridge/generated'
import type { Recording } from '@/bridge/types'
import { EditorPreferencesProvider } from '@/features/editor/components/EditorPreferencesProvider'
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

/** How wide the timeline is laid out, in points. */
const TIMELINE_WIDTH = 1000

const sideA = recording('Side A.mp3', { durationMs: 60_000 })
const tape = recording('Tape.mp3', { durationMs: 120_000 })

const draftOf = (edits: {
  firstName: string
  splices?: { atMs: number; name: string }[]
  deleted?: { startMs: number; endMs: number }[]
}) =>
  JSON.stringify({
    firstName: edits.firstName,
    splices: edits.splices ?? [],
    deleted: edits.deleted ?? [],
  })

const draftWithSideB = draftOf({
  firstName: 'Side A',
  splices: [{ atMs: 30_000, name: 'Side B' }],
})

/** A gap Find Tracks found, sliced at `atMs`. */
const proposal = (
  atMs: number,
  remove: [number, number] | null = null,
): Proposal => ({
  atMs,
  gapStartMs: atMs - 1000,
  gapEndMs: atMs,
  delete: remove,
})

/** The recording the editor is open on. */
let shown: Recording = sideA

const Editor: FC = () => (
  <SkinProvider>
    <EditorPreferencesProvider>
      <EditorPanel
        target={{
          fileName: shown.fileName,
          path: shown.path,
          title: shown.title,
          durationMs: shown.durationMs,
        }}
        onSaved={() => {}}
      />
    </EditorPreferencesProvider>
  </SkinProvider>
)

/** Opens the editor on `rec`, its timeline laid out 1000 points wide. */
const openEditor = async (rec: Recording = sideA) => {
  shown = rec
  fakeCore.setRecordings([rec])
  fakeEditor.addRecording(rec.path, rec.durationMs)
  const view = await render(<Editor />)
  await fireEvent.layout(screen.getByLabelText('Timeline'), {
    width: TIMELINE_WIDTH,
    height: 200,
  })
  return view
}

/** Where `ms` is on the timeline as it opens (the whole recording in view). */
const pointAt = (ms: number) => ms / (shown.durationMs / TIMELINE_WIDTH)

const at = (ms: number) => ({
  nativeEvent: { locationX: pointAt(ms), pageX: pointAt(ms) },
})

/** Clicks the ruler at `ms`, moving the playhead there. */
const clickRuler = async (ms: number) => {
  const ruler = screen.getByLabelText('Ruler')
  await fireEvent(ruler, 'responderGrant', at(ms))
  await fireEvent(ruler, 'responderRelease', at(ms))
}

/** Clicks the waveform at `ms`. */
const clickWaveform = async (ms: number) => {
  const waveform = screen.getByLabelText('Waveform')
  await fireEvent(waveform, 'responderGrant', at(ms))
  await fireEvent(waveform, 'responderRelease', at(ms))
}

/** Drags across the waveform from `fromMs` to `toMs`, selecting the stretch. */
const dragWaveform = async (fromMs: number, toMs: number) => {
  const waveform = screen.getByLabelText('Waveform')
  await fireEvent(waveform, 'responderGrant', at(fromMs))
  await fireEvent(waveform, 'responderMove', at(toMs))
  await fireEvent(waveform, 'responderRelease', at(toMs))
}

/** Drags a slice's edge (by its accessible name) `byMs` along. */
const dragSlice = async (name: string, byMs: number) => {
  const edge = screen.getByLabelText(name)
  await fireEvent(edge, 'responderGrant', at(0))
  await fireEvent(edge, 'responderMove', at(byMs))
  await fireEvent(edge, 'responderRelease', at(byMs))
}

/** Presses a key while the editor has the keys. */
const pressKey = (
  key: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
) =>
  fireEvent(screen.getByLabelText('Track editor'), 'keyDown', {
    nativeEvent: { key, ...modifiers },
  })

const press = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.press(screen.getByRole('button', { name }))

/** Moves the playhead to `ms`, presses Slice and keeps the name offered. */
const sliceAt = async (
  user: ReturnType<typeof userEvent.setup>,
  ms: number,
) => {
  await clickRuler(ms)
  await press(user, 'Slice')
  await fireEvent(screen.getByLabelText('Track name'), 'submitEditing')
}

/** Deletes the name in a name field, types `name` and presses Enter. */
const rename = (
  user: ReturnType<typeof userEvent.setup>,
  field: ReturnType<typeof screen.getByLabelText>,
  from: string,
  name: string,
) =>
  user.type(field, '{Backspace}'.repeat(from.length) + name, {
    submitEditing: true,
  })

/** Deletes the stretch from `fromMs` to `toMs`. */
const deleteStretch = async (
  user: ReturnType<typeof userEvent.setup>,
  fromMs: number,
  toMs: number,
) => {
  await dragWaveform(fromMs, toMs)
  await press(user, 'Delete Selection')
}

/** A row of the track list, by everything it shows. */
const trackRow = (n: number, name: string, start: string, length: string) =>
  screen.queryByRole('button', {
    name: `Track ${String(n)}: ${name}, starts ${start}, ${length} long`,
  })

const anyTrackRow = (n: number) =>
  screen.queryByRole('button', { name: new RegExp(`^Track ${String(n)}: `) })

/** The position readout: where the playhead is, and of how long. */
const position = () => screen.getByRole('timer')

/** What's in view, under the timeline. */
const inView = (range: string) => screen.getByText(range)

describe('the track editor', () => {
  beforeEach(() => {
    fakeCore.reset()
    fakeSkins.reset()
    fakeEditor.reset()
    // Nothing loaded in the player.
    fakeCore.emit({ kind: 'playerState' })
    skinStore.set(testSkin())
  })

  describe('given a recording with no draft', () => {
    it('shows it as one track named after the recording', async () => {
      await openEditor()
      expect(trackRow(1, 'Side A', '0:00.0', '1:00.0')).toBeOnTheScreen()
    })

    it('has nothing to undo', async () => {
      await openEditor()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    })

    it('has nothing to clear', async () => {
      await openEditor()
      expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled()
    })

    it('has nothing to save', async () => {
      await openEditor()
      expect(screen.getByRole('button', { name: 'Save…' })).toBeDisabled()
    })

    describe('when the playhead is moved to 0:05 and Slice is pressed', () => {
      it('lists a track from 0:05 named "Track 2"', async () => {
        const user = userEvent.setup()
        await openEditor()
        await clickRuler(5000)
        await press(user, 'Slice')
        expect(trackRow(2, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
      })

      it('offers the new track’s name to edit', async () => {
        const user = userEvent.setup()
        await openEditor()
        await clickRuler(5000)
        await press(user, 'Slice')
        expect(screen.getByLabelText('Track name')).toHaveDisplayValue(
          'Track 2',
        )
      })

      it('can be saved', async () => {
        const user = userEvent.setup()
        await openEditor()
        await clickRuler(5000)
        await press(user, 'Slice')
        expect(screen.getByRole('button', { name: 'Save…' })).toBeEnabled()
      })
    })

    describe('when a slice is made at 0:05 and named "Intro"', () => {
      it('lists the new track as Intro', async () => {
        const user = userEvent.setup()
        await openEditor()
        await clickRuler(5000)
        await press(user, 'Slice')
        const name = screen.getByLabelText('Track name')
        await rename(user, name, 'Track 2', 'Intro')
        expect(trackRow(2, 'Intro', '0:05.0', '0:55.0')).toBeOnTheScreen()
      })
    })
  })

  describe('given a draft with a slice at 0:05 named "Track 2"', () => {
    beforeEach(() => {
      fakeEditor.setDraft(
        sideA.fileName,
        draftOf({
          firstName: 'Side A',
          splices: [{ atMs: 5000, name: 'Track 2' }],
        }),
      )
    })

    describe('when a slice is made at 0:02', () => {
      it('names the new track "Track 2"', async () => {
        const user = userEvent.setup()
        await openEditor()
        await sliceAt(user, 2000)
        expect(trackRow(2, 'Track 2', '0:02.0', '0:03.0')).toBeOnTheScreen()
      })

      it('lists the tracks in time order', async () => {
        const user = userEvent.setup()
        await openEditor()
        await sliceAt(user, 2000)
        expect(trackRow(3, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
      })
    })

    describe('when a slice is made at 0:09', () => {
      it('names the new track "Track 3"', async () => {
        const user = userEvent.setup()
        await openEditor()
        await sliceAt(user, 9000)
        expect(trackRow(3, 'Track 3', '0:09.0', '0:51.0')).toBeOnTheScreen()
      })
    })

    describe('when its track is renamed "Song" in the track list', () => {
      it('lists the track as Song', async () => {
        const user = userEvent.setup()
        await openEditor()
        const name = screen.getByLabelText('Track 2 name')
        await rename(user, name, 'Track 2', 'Song')
        expect(trackRow(2, 'Song', '0:05.0', '0:55.0')).toBeOnTheScreen()
      })
    })

    describe('when its slice is clicked and Remove Slice is pressed', () => {
      it('goes back to one track', async () => {
        const user = userEvent.setup()
        await openEditor()
        await dragSlice('Slice Track 2 at 0:05.0', 0)
        await press(user, 'Remove Slice')
        expect(anyTrackRow(2)).not.toBeOnTheScreen()
      })
    })
  })

  describe('given a draft with slices at 0:02 and 0:05', () => {
    beforeEach(() => {
      fakeEditor.setDraft(
        sideA.fileName,
        draftOf({
          firstName: 'Side A',
          splices: [
            { atMs: 2000, name: 'Track 2' },
            { atMs: 5000, name: 'Track 3' },
          ],
        }),
      )
    })

    describe('when the slice at 0:02 is dragged to 0:09', () => {
      it('lists the track it starts after the one from 0:05', async () => {
        await openEditor()
        await dragSlice('Slice Track 2 at 0:02.0', 7000)
        expect(trackRow(3, 'Track 2', '0:09.0', '0:51.0')).toBeOnTheScreen()
      })
    })

    describe('given the playhead at 0:03', () => {
      describe('when Tab is pressed', () => {
        it('moves the playhead to the next slice', async () => {
          await openEditor()
          await clickRuler(3000)
          await pressKey('Tab')
          expect(position()).toHaveTextContent(/^0:05\.0/)
        })

        it('selects that slice', async () => {
          await openEditor()
          await clickRuler(3000)
          await pressKey('Tab')
          expect(
            screen.getByRole('button', { name: 'Remove Slice' }),
          ).toBeOnTheScreen()
        })
      })

      describe('when Shift-Tab is pressed', () => {
        it('moves the playhead to the slice before', async () => {
          await openEditor()
          await clickRuler(3000)
          await pressKey('Tab', { shiftKey: true })
          expect(position()).toHaveTextContent(/^0:02\.0/)
        })
      })
    })

    describe('given the playhead on the last slice', () => {
      describe('when Tab is pressed', () => {
        it('moves the playhead to the end', async () => {
          await openEditor()
          await clickRuler(5000)
          await pressKey('Tab')
          expect(position()).toHaveTextContent(/^1:00\.0/)
        })
      })
    })
  })

  describe('given a stretch from 0:01 to 0:03 is selected', () => {
    describe('when Delete Selection is pressed', () => {
      it('takes the stretch out of its track', async () => {
        const user = userEvent.setup()
        await openEditor()
        await deleteStretch(user, 1000, 3000)
        expect(trackRow(1, 'Side A', '0:00.0', '0:58.0')).toBeOnTheScreen()
      })
    })
  })

  describe('given overlapping stretches deleted', () => {
    // 0:01–0:03, 0:05–0:06 and 0:02–0:05: together 0:01–0:06.
    const deleteOverlapping = async (
      user: ReturnType<typeof userEvent.setup>,
    ) => {
      await deleteStretch(user, 3000, 1000)
      await deleteStretch(user, 5000, 6000)
      await deleteStretch(user, 2000, 5000)
    }

    it('takes out what they cover once', async () => {
      const user = userEvent.setup()
      await openEditor()
      await deleteOverlapping(user)
      expect(trackRow(1, 'Side A', '0:00.0', '0:55.0')).toBeOnTheScreen()
    })

    describe('when the waveform is clicked inside them', () => {
      it('offers to restore the deleted stretch', async () => {
        const user = userEvent.setup()
        await openEditor()
        await deleteOverlapping(user)
        await clickWaveform(4000)
        expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled()
      })
    })

    describe('when the waveform is clicked inside them, then where they end', () => {
      it('has nothing to delete or restore', async () => {
        const user = userEvent.setup()
        await openEditor()
        await deleteOverlapping(user)
        await clickWaveform(4000)
        await clickWaveform(6000)
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
      })
    })

    describe('when the waveform is clicked inside them and Restore pressed', () => {
      it('puts the whole stretch back', async () => {
        const user = userEvent.setup()
        await openEditor()
        await deleteOverlapping(user)
        await clickWaveform(4000)
        await press(user, 'Restore')
        expect(trackRow(1, 'Side A', '0:00.0', '1:00.0')).toBeOnTheScreen()
      })
    })
  })

  describe('drafts', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    /** Fake time, so the draft (kept a moment after each edit) can be awaited. */
    const fakeTime = () => {
      vi.useFakeTimers()
      return userEvent.setup({
        advanceTimers: ms => {
          vi.advanceTimersByTime(ms)
        },
      })
    }

    const aMomentPasses = () => vi.advanceTimersByTimeAsync(1000)

    describe('given a draft with a track named A, a slice and a deleted stretch', () => {
      const saved = draftOf({
        firstName: 'A',
        splices: [{ atMs: 10, name: 'B' }],
        deleted: [{ startMs: 1, endMs: 2 }],
      })

      beforeEach(() => {
        fakeEditor.setDraft(sideA.fileName, saved)
      })

      describe('when the editor opens and a moment passes', () => {
        it('keeps the same draft', async () => {
          fakeTime()
          await openEditor()
          await aMomentPasses()
          expect(fakeEditor.draft(sideA.fileName)).toBe(saved)
        })
      })
    })

    describe('given a draft whose first track has no name', () => {
      beforeEach(() => {
        fakeEditor.setDraft(
          sideA.fileName,
          draftOf({
            firstName: ' ',
            splices: [{ atMs: 10, name: 'B' }],
            deleted: [{ startMs: 1, endMs: 2 }],
          }),
        )
      })

      it('names the first track after the recording', async () => {
        await openEditor()
        expect(trackRow(1, 'Side A', '0:00.0', '0:00.0')).toBeOnTheScreen()
      })
    })

    describe('given no draft', () => {
      describe('when a slice is made at 0:05 and a moment passes', () => {
        it('keeps the slice as the draft', async () => {
          const user = fakeTime()
          await openEditor()
          await sliceAt(user, 5000)
          await aMomentPasses()
          expect(fakeEditor.draft(sideA.fileName)).toBe(
            draftOf({
              firstName: 'Side A',
              splices: [{ atMs: 5000, name: 'Track 2' }],
            }),
          )
        })
      })

      describe('when a slice is made at 0:05, a moment passes and the editor is opened again', () => {
        it('lists the slice’s track', async () => {
          const user = fakeTime()
          const { unmount } = await openEditor()
          await sliceAt(user, 5000)
          await aMomentPasses()
          await unmount()
          await openEditor()
          expect(trackRow(2, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
        })
      })
    })

    describe('given a draft with a slice at 0:30 named Side B', () => {
      beforeEach(() => {
        fakeEditor.setDraft(sideA.fileName, draftWithSideB)
      })

      it("lists the slice's track", async () => {
        await openEditor()
        expect(trackRow(2, 'Side B', '0:30.0', '0:30.0')).toBeOnTheScreen()
      })

      it('can be saved', async () => {
        await openEditor()
        expect(screen.getByRole('button', { name: 'Save…' })).toBeEnabled()
      })

      describe('when Clear All is pressed', () => {
        it('goes back to one track', async () => {
          const user = userEvent.setup()
          await openEditor()
          await press(user, 'Clear All')
          expect(anyTrackRow(2)).not.toBeOnTheScreen()
        })
      })

      describe('when Clear All is pressed, then Undo', () => {
        it("lists the slice's track again", async () => {
          const user = userEvent.setup()
          await openEditor()
          await press(user, 'Clear All')
          await press(user, 'Undo')
          expect(trackRow(2, 'Side B', '0:30.0', '0:30.0')).toBeOnTheScreen()
        })
      })

      describe('when Clear All is pressed and a moment passes', () => {
        it('keeps the cleared edits as the draft', async () => {
          const user = fakeTime()
          await openEditor()
          await press(user, 'Clear All')
          await aMomentPasses()
          expect(fakeEditor.draft(sideA.fileName)).toBe(
            draftOf({ firstName: 'Side A' }),
          )
        })
      })
    })

    describe("given a draft that doesn't read", () => {
      beforeEach(() => {
        fakeEditor.setDraft(sideA.fileName, '{bad')
      })

      it('opens with nothing to clear', async () => {
        await openEditor()
        expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled()
      })
    })

    describe("given a draft that isn't an edit list", () => {
      beforeEach(() => {
        fakeEditor.setDraft(
          sideA.fileName,
          '{"firstName":"A","splices":[{"atMs":"x"}],"deleted":[]}',
        )
      })

      it('shows the recording as one track named after it', async () => {
        await openEditor()
        expect(trackRow(1, 'Side A', '0:00.0', '1:00.0')).toBeOnTheScreen()
      })

      it('opens with nothing to clear', async () => {
        await openEditor()
        expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled()
      })
    })
  })

  describe('Auto Slice', () => {
    describe('given a slice at 1:00 named Kept, and gaps found at 0:30, 1:01 and 1:30', () => {
      beforeEach(() => {
        fakeEditor.setDraft(
          tape.fileName,
          draftOf({
            firstName: 'Tape',
            splices: [{ atMs: 60_000, name: 'Kept' }],
          }),
        )
        fakeEditor.setProposals([
          proposal(30_000),
          proposal(61_000),
          proposal(90_000),
        ])
      })

      describe('when Auto Slice is pressed', () => {
        it('says how many tracks it would make', async () => {
          const user = userEvent.setup()
          await openEditor(tape)
          await press(user, 'Auto Slice')
          expect(screen.getByText('4 tracks · 3 slices')).toBeOnTheScreen()
        })
      })

      describe('when Auto Slice, then Add Slices is pressed', () => {
        it('adds a track at 0:30 named after its place', async () => {
          const user = userEvent.setup()
          await openEditor(tape)
          await press(user, 'Auto Slice')
          await press(user, 'Add Slices')
          expect(trackRow(2, 'Track 2', '0:30.0', '0:30.0')).toBeOnTheScreen()
        })

        it('adds a track at 1:30 named after its place', async () => {
          const user = userEvent.setup()
          await openEditor(tape)
          await press(user, 'Auto Slice')
          await press(user, 'Add Slices')
          expect(trackRow(4, 'Track 4', '1:30.0', '0:30.0')).toBeOnTheScreen()
        })

        it('skips the gap next to the slice already at 1:00', async () => {
          const user = userEvent.setup()
          await openEditor(tape)
          await press(user, 'Auto Slice')
          await press(user, 'Add Slices')
          expect(trackRow(3, 'Kept', '1:00.0', '0:30.0')).toBeOnTheScreen()
        })
      })
    })

    describe('given a gap found at 0:30, with 0:29–0:29.8 to remove', () => {
      beforeEach(() => {
        fakeEditor.setProposals([proposal(30_000, [29_000, 29_800])])
      })

      describe('when Auto Slice, then Add Slices is pressed', () => {
        it('deletes the gap from the track before it', async () => {
          const user = userEvent.setup()
          await openEditor(tape)
          await press(user, 'Auto Slice')
          await press(user, 'Add Slices')
          expect(trackRow(1, 'Tape', '0:00.0', '0:29.2')).toBeOnTheScreen()
        })
      })
    })

    describe('given a slice at 0:30, and only a gap found at 0:31', () => {
      beforeEach(() => {
        fakeEditor.setDraft(sideA.fileName, draftWithSideB)
        fakeEditor.setProposals([proposal(31_000)])
      })

      describe('when Auto Slice, then Add Slices is pressed', () => {
        it('leaves nothing to undo', async () => {
          const user = userEvent.setup()
          await openEditor()
          await press(user, 'Auto Slice')
          await press(user, 'Add Slices')
          expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        })
      })
    })
  })

  describe('undo and redo', () => {
    describe('given a slice made at 0:05 and then removed', () => {
      const sliceAndRemove = async (
        user: ReturnType<typeof userEvent.setup>,
      ) => {
        await sliceAt(user, 5000)
        await press(user, 'Remove Slice')
      }

      describe('when Undo is pressed', () => {
        it('brings the slice back', async () => {
          const user = userEvent.setup()
          await openEditor()
          await sliceAndRemove(user)
          await press(user, 'Undo')
          expect(trackRow(2, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
        })
      })

      describe('when ⌘Z is pressed', () => {
        it('brings the slice back', async () => {
          const user = userEvent.setup()
          await openEditor()
          await sliceAndRemove(user)
          await pressKey('z', { metaKey: true })
          expect(trackRow(2, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
        })
      })

      describe('when Undo is pressed twice', () => {
        it('goes back to the start, with nothing more to undo', async () => {
          const user = userEvent.setup()
          await openEditor()
          await sliceAndRemove(user)
          await press(user, 'Undo')
          await press(user, 'Undo')
          expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        })
      })

      describe('when Undo is pressed twice, then Redo', () => {
        it('brings the slice back', async () => {
          const user = userEvent.setup()
          await openEditor()
          await sliceAndRemove(user)
          await press(user, 'Undo')
          await press(user, 'Undo')
          await press(user, 'Redo')
          expect(trackRow(2, 'Track 2', '0:05.0', '0:55.0')).toBeOnTheScreen()
        })
      })
    })

    describe('given a draft and nothing to undo', () => {
      beforeEach(() => {
        fakeEditor.setDraft(sideA.fileName, draftWithSideB)
      })

      describe('when ⌘Z is pressed', () => {
        it('keeps the draft’s slice', async () => {
          await openEditor()
          await pressKey('z', { metaKey: true })
          expect(trackRow(2, 'Side B', '0:30.0', '0:30.0')).toBeOnTheScreen()
        })
      })
    })
  })

  describe('the ruler', () => {
    const labels = () =>
      within(screen.getByLabelText('Ruler')).queryAllByText(/^[\d:.]+$/)

    describe('given a 16:40 recording (1 s per point)', () => {
      const long = recording('Long.mp3', { durationMs: 1_000_000 })

      it('labels every 2 minutes', async () => {
        await openEditor(long)
        // 0:00, 2:00, … 16:00.
        expect(labels()).toHaveLength(9)
      })

      it('snaps to every 30 s', async () => {
        await openEditor(long)
        expect(screen.getByRole('button', { name: 'Snap' })).toHaveTextContent(
          /30 s$/,
        )
      })
    })

    describe('given a 10 s recording (10 ms per point)', () => {
      const short = recording('Short.mp3', { durationMs: 10_000 })

      it('labels every second', async () => {
        await openEditor(short)
        expect(labels()).toHaveLength(11)
      })

      it('snaps to every 200 ms', async () => {
        await openEditor(short)
        expect(screen.getByRole('button', { name: 'Snap' })).toHaveTextContent(
          /200 ms$/,
        )
      })

      describe('when the ruler is clicked at 1.29 s', () => {
        it('puts the playhead on the nearest 200 ms', async () => {
          await openEditor(short)
          await clickRuler(1290)
          expect(position()).toHaveTextContent(/^0:01\.2/)
        })
      })

      describe('when Snap is turned off and the ruler clicked at 1.29 s', () => {
        it('puts the playhead where it was clicked', async () => {
          const user = userEvent.setup()
          await openEditor(short)
          await press(user, 'Snap')
          await clickRuler(1290)
          expect(position()).toHaveTextContent(/^0:01\.3/)
        })
      })
    })

    describe('given the deepest zoom', () => {
      const zoomAllTheWayIn = async () => {
        for (let i = 0; i < 15; i++) {
          await pressKey('=')
        }
      }

      it('labels every 10 ms', async () => {
        await openEditor()
        await zoomAllTheWayIn()
        expect(
          within(screen.getByLabelText('Ruler')).getByText('0:30.01'),
        ).toBeOnTheScreen()
      })

      it('snaps to every 2 ms', async () => {
        await openEditor()
        await zoomAllTheWayIn()
        expect(screen.getByRole('button', { name: 'Snap' })).toHaveTextContent(
          /2 ms$/,
        )
      })

      it('shows what’s in view to the millisecond', async () => {
        await openEditor()
        await zoomAllTheWayIn()
        expect(inView('0:29.950 – 0:30.050')).toBeOnTheScreen()
      })
    })
  })

  describe('the position readout', () => {
    describe('given a 1:05 recording', () => {
      it('shows its length in minutes and seconds', async () => {
        await openEditor(recording('Song.mp3', { durationMs: 65_000 }))
        expect(position()).toHaveTextContent(/OF 1:05$/)
      })
    })

    describe('given a recording a moment short of a minute', () => {
      it('rounds its length to the second', async () => {
        await openEditor(recording('Song.mp3', { durationMs: 59_999 }))
        expect(position()).toHaveTextContent(/OF 1:00$/)
      })
    })

    describe('given a recording over an hour long', () => {
      it('shows its length in hours, minutes and seconds', async () => {
        await openEditor(recording('Set.mp3', { durationMs: 3_725_000 }))
        expect(position()).toHaveTextContent(/OF 1:02:05$/)
      })
    })

    describe('given another recording was loaded for playback', () => {
      describe('when Play is pressed', () => {
        it('plays this one, with Pause and Stop to press', async () => {
          const user = userEvent.setup()
          await fakeCore.native.playerLoad(sideA.path)
          await openEditor(tape)
          await press(user, 'Play')
          expect(
            await screen.findByRole('button', { name: 'Pause' }),
          ).toBeOnTheScreen()
          expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
        })
      })
    })

    describe('given the recording playing at 1:05.25', () => {
      it('shows the playhead to a tenth of a second', async () => {
        const user = userEvent.setup()
        await openEditor(tape)
        await press(user, 'Play')
        fakeCore.emit({ kind: 'playerProgress', positionMs: 65_250 })
        expect(await screen.findByRole('timer')).toHaveTextContent(/^1:05\.3/)
      })
    })
  })

  describe('zooming', () => {
    describe('given zoomed in once', () => {
      describe('when zoomed out three times', () => {
        it('stops with the whole recording in view', async () => {
          await openEditor()
          await pressKey('=')
          await pressKey('-')
          await pressKey('-')
          await pressKey('-')
          expect(inView('0:00 – 1:00')).toBeOnTheScreen()
        })
      })
    })

    describe('when zoomed in more times than it goes', () => {
      it('stops at the deepest zoom', async () => {
        await openEditor()
        for (let i = 0; i < 15; i++) {
          await pressKey('=')
        }
        expect(
          screen.getByRole('adjustable', { name: 'Horizontal zoom' }),
        ).toHaveAccessibilityValue({ now: 100 })
      })
    })

    describe('given the playhead at 0:20, a third of the way along', () => {
      describe('when zoomed in', () => {
        it('keeps 0:20 a third of the way along', async () => {
          await openEditor()
          await clickRuler(20_000)
          await pressKey('=')
          expect(inView('0:10 – 0:40')).toBeOnTheScreen()
        })
      })
    })

    describe('when Horizontal zoom: more is pressed', () => {
      it('zooms in', async () => {
        const user = userEvent.setup()
        await openEditor()
        await press(user, 'Horizontal zoom: more')
        expect(
          screen.getByRole('adjustable', { name: 'Horizontal zoom' }),
        ).toHaveAccessibilityValue({ now: 10 })
      })
    })
  })
})

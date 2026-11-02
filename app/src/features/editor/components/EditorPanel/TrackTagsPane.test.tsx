import {
  fireEvent,
  render,
  screen,
  userEvent,
  within,
} from '@testing-library/react-native'
import React, { type FC } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditList, Marker, TrackTags } from '@/bridge/generated'
import { parseNative } from '@/bridge/parseNative'
import { EditorPreferencesProvider } from '@/features/editor/components/EditorPreferencesProvider'
import { isEditList } from '@/features/editor/guards/isEditList'
import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { skinStore } from '@/features/skins/skinStore'
import { isNullable } from '@/shared/utils/guards'
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

const Editor: FC = () => (
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
  </SkinProvider>
)

/** The recording is tagged The Band / Live, with a cover. */
const recordingTags = {
  artist: 'The Band',
  album: 'Live',
  coverPath: '/covers/recording.jpg',
}

/** Opens the editor on Side A, its timeline laid out 1000 points wide. */
const openEditor = async () => {
  fakeCore.setRecordings([sideA], { [sideA.fileName]: recordingTags })
  fakeEditor.addRecording(sideA.path, sideA.durationMs)
  const view = await render(<Editor />)
  await fireEvent.layout(screen.getByLabelText('Timeline'), {
    width: TIMELINE_WIDTH,
    height: 200,
  })
  // The recording's tags are read once it opens.
  await screen.findByLabelText('Track 1 artist: Opener')
  return view
}

const at = (ms: number) => {
  const x = ms / (sideA.durationMs / TIMELINE_WIDTH)
  return { nativeEvent: { locationX: x, pageX: x } }
}

/** Moves the playhead to `ms`, presses Slice and keeps the name offered. */
const sliceAt = async (
  user: ReturnType<typeof userEvent.setup>,
  ms: number,
) => {
  const ruler = screen.getByLabelText('Ruler')
  await fireEvent(ruler, 'responderGrant', at(ms))
  await fireEvent(ruler, 'responderRelease', at(ms))
  await user.press(screen.getByRole('button', { name: 'Slice' }))
  await fireEvent(screen.getByLabelText('Track name'), 'submitEditing')
}

/** An edit list: the first track named Opener, and these edits. */
const listOf = (edits: Partial<EditList>): EditList => ({
  firstName: 'Opener',
  splices: [],
  deleted: [],
  ...edits,
})

/** The draft the core keeps now. */
const savedDraft = (): EditList | null =>
  parseNative(
    fakeEditor.draft(sideA.fileName) ?? 'null',
    isNullable(isEditList),
    'draft',
  )

const opener: TrackTags = { artist: 'Opener' }
const guest: TrackTags = { artist: 'Guest', cover: 'guest.png' }

/** Opener (its own artist) until 0:30, then Side B (its own artist and cover). */
const tagged = listOf({
  firstTags: opener,
  splices: [{ atMs: 30_000, name: 'Side B', tags: guest }],
})
const taggedDraft = JSON.stringify(tagged)

/** A row of the track list (press it to pick the track). */
const trackRow = (n: number) =>
  screen.getByRole('button', { name: new RegExp(`^Track ${String(n)}: `) })

/** The tag form beside the editor. */
const form = () => within(screen.getByLabelText('Track tags'))

/** The form's button showing a field's value (press it to edit in place). */
const field = (label: string, value: string) =>
  form().findByRole('button', { name: `${label}: ${value}. Click to edit.` })

/** Edits a field of the form: clears what it opens with, types `text`, Enter. */
const editField = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
  text: string,
  shown = value,
) => {
  await user.press(await field(label, value))
  await user.type(
    form().getByDisplayValue(shown),
    '{Backspace}'.repeat(shown.length) + text,
    { submitEditing: true },
  )
}

/** Side B's cover, as an image source. */
const guestCover = [{ uri: 'file:///drafts/Side%20A.mp3/covers/guest.png' }]

describe('track tags in the editor', () => {
  beforeEach(async () => {
    fakeCore.reset()
    fakeSkins.reset()
    fakeEditor.reset()
    fakeCore.emit({ kind: 'playerState' })
    skinStore.set(testSkin())
    // Side B's cover, stored in the draft's folder.
    await fakeEditor.native.storeEditCover(sideA.fileName, '/tmp/guest.png')
  })

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

  describe('given a draft whose tracks have their own tags', () => {
    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, taggedDraft)
    })

    it("shows each track's artist under its name", async () => {
      await openEditor()
      expect(screen.getByLabelText('Track 1 artist: Opener')).toBeOnTheScreen()
      expect(screen.getByLabelText('Track 2 artist: Guest')).toBeOnTheScreen()
    })

    it("shows a track's own cover", async () => {
      await openEditor()
      expect(screen.getByLabelText('Track 2 cover')).toHaveProp(
        'source',
        guestCover,
      )
    })

    it("shows the recording's cover for a track without one", async () => {
      await openEditor()
      expect(screen.getByLabelText('Track 1 cover')).toHaveProp('source', [
        { uri: 'file:///covers/recording.jpg' },
      ])
    })

    describe('when the editor opens and a moment passes', () => {
      it('keeps the tracks’ tags in the draft', async () => {
        fakeTime()
        await openEditor()
        await aMomentPasses()
        expect(savedDraft()).toEqual(tagged)
      })
    })

    describe('when a slice is made inside Side B', () => {
      it("gives the new track Side B's tags under its own name", async () => {
        const user = fakeTime()
        await openEditor()
        await sliceAt(user, 45_000)
        await aMomentPasses()
        expect(savedDraft()).toEqual(
          listOf({
            firstTags: opener,
            splices: [
              { atMs: 30_000, name: 'Side B', tags: guest },
              { atMs: 45_000, name: 'Track 3', tags: guest },
            ],
          }),
        )
      })
    })

    describe('when a slice is made inside the first track', () => {
      it("gives the new track the first track's tags", async () => {
        const user = fakeTime()
        await openEditor()
        await sliceAt(user, 10_000)
        await aMomentPasses()
        expect(savedDraft()).toEqual(
          listOf({
            firstTags: opener,
            splices: [
              { atMs: 10_000, name: 'Track 2', tags: opener },
              { atMs: 30_000, name: 'Side B', tags: guest },
            ],
          }),
        )
      })
    })

    describe("when Side B's slice is removed", () => {
      it('keeps the first track’s tags', async () => {
        const user = fakeTime()
        await openEditor()
        const edge = screen.getByLabelText('Slice Side B at 0:30.0')
        await fireEvent(edge, 'responderGrant', at(0))
        await fireEvent(edge, 'responderRelease', at(0))
        await user.press(screen.getByRole('button', { name: 'Remove Slice' }))
        await aMomentPasses()
        expect(savedDraft()).toEqual(listOf({ firstTags: opener }))
      })
    })
  })

  describe('given a draft that only gives the first track an artist', () => {
    beforeEach(() => {
      fakeEditor.setDraft(
        sideA.fileName,
        JSON.stringify(listOf({ firstTags: opener })),
      )
    })

    it('can be saved', async () => {
      await openEditor()
      expect(screen.getByRole('button', { name: 'Save…' })).toBeEnabled()
    })
  })

  describe('the tag form', () => {
    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, taggedDraft)
    })

    describe("when track 2's pencil is pressed", () => {
      const openForm = async () => {
        const user = userEvent.setup()
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 2' }),
        )
        return user
      }

      it('is aimed at track 2', async () => {
        await openForm()
        expect(
          form().getByRole('header', { name: 'Track 2' }),
        ).toBeOnTheScreen()
      })

      it('shows the track name as its title', async () => {
        await openForm()
        expect(await field('Title', 'Side B')).toBeOnTheScreen()
      })

      it("shows the track's own artist", async () => {
        await openForm()
        expect(await field('Artist', 'Guest')).toBeOnTheScreen()
      })

      it("shows the recording's album, which the track doesn't change", async () => {
        await openForm()
        expect(await field('Album', 'Live')).toBeOnTheScreen()
      })

      it('shows its place as its track number', async () => {
        await openForm()
        expect(await field('Track #', '2')).toBeOnTheScreen()
      })

      it("shows the track's cover", async () => {
        await openForm()
        expect(form().getByRole('image', { name: 'Cover' })).toHaveProp(
          'source',
          guestCover,
        )
      })

      describe('and then track 1 is picked in the list', () => {
        const pickTrack1 = async () => {
          const user = await openForm()
          await user.press(trackRow(1))
        }

        it('is aimed at track 1', async () => {
          await pickTrack1()
          expect(
            form().getByRole('header', { name: 'Track 1' }),
          ).toBeOnTheScreen()
        })

        it("shows track 1's artist", async () => {
          await pickTrack1()
          expect(await field('Artist', 'Opener')).toBeOnTheScreen()
        })

        it("shows track 1's cover", async () => {
          await pickTrack1()
          expect(form().getByRole('image', { name: 'Cover' })).toHaveProp(
            'source',
            [{ uri: 'file:///covers/recording.jpg' }],
          )
        })
      })
    })

    describe('when the artist is changed in the form', () => {
      const changeArtist = async (user: ReturnType<typeof userEvent.setup>) => {
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 2' }),
        )
        await editField(user, 'Artist', 'Guest', 'Someone')
      }

      it('shows the new artist under the track', async () => {
        await changeArtist(userEvent.setup())
        expect(
          await screen.findByLabelText('Track 2 artist: Someone'),
        ).toBeOnTheScreen()
      })

      it('keeps it in the draft', async () => {
        const user = fakeTime()
        await changeArtist(user)
        await aMomentPasses()
        expect(savedDraft()).toEqual(
          listOf({
            firstTags: opener,
            splices: [
              {
                atMs: 30_000,
                name: 'Side B',
                tags: { ...guest, artist: 'Someone' },
              },
            ],
          }),
        )
      })

      describe('and then Undo is pressed', () => {
        it('shows the artist it had', async () => {
          const user = userEvent.setup()
          await changeArtist(user)
          await screen.findByLabelText('Track 2 artist: Someone')
          await user.press(screen.getByRole('button', { name: 'Undo' }))
          expect(
            await screen.findByLabelText('Track 2 artist: Guest'),
          ).toBeOnTheScreen()
        })
      })
    })

    describe("when the album is set back to the recording's", () => {
      it('leaves the track no override for it', async () => {
        const user = fakeTime()
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 1' }),
        )
        await editField(user, 'Album', 'Live', 'Other')
        await editField(user, 'Album', 'Other', 'Live')
        await aMomentPasses()
        expect(savedDraft()).toEqual(tagged)
      })
    })

    describe('when the title is changed in the form', () => {
      it('renames the track', async () => {
        const user = userEvent.setup()
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 2' }),
        )
        await editField(user, 'Title', 'Side B', 'Encore')
        expect(
          await screen.findByRole('button', { name: /^Track 2: Encore, / }),
        ).toBeOnTheScreen()
      })
    })

    describe('when a cover is chosen in the form', () => {
      it("stores it in the draft as the track's cover", async () => {
        const user = fakeTime()
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 1' }),
        )
        fakeCore.setPick('/Pictures/front.png')
        await user.press(form().getByRole('button', { name: /^Cover art\. / }))
        await aMomentPasses()
        expect(savedDraft()).toEqual(
          listOf({
            firstTags: { ...opener, cover: 'front.png' },
            splices: [{ atMs: 30_000, name: 'Side B', tags: guest }],
          }),
        )
        expect(fakeEditor.coverPath(sideA.fileName, 'front.png')).toBeDefined()
      })
    })

    describe('when a track row is double-clicked', () => {
      it('opens the form on that track', async () => {
        const user = userEvent.setup()
        await openEditor()
        await user.press(trackRow(2))
        await user.press(trackRow(2))
        expect(
          form().getByRole('header', { name: 'Track 2' }),
        ).toBeOnTheScreen()
      })
    })

    describe('when Close is pressed', () => {
      it('closes the form', async () => {
        const user = userEvent.setup()
        await openEditor()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 2' }),
        )
        await user.press(form().getByRole('button', { name: 'Close' }))
        expect(screen.queryByLabelText('Track tags')).not.toBeOnTheScreen()
      })
    })
  })

  describe('given two tracks selected with a shift-click', () => {
    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, taggedDraft)
    })

    const selectBoth = async () => {
      const user = userEvent.setup()
      await openEditor()
      await fireEvent.press(trackRow(1), { nativeEvent: {} })
      await fireEvent.press(trackRow(2), { nativeEvent: { shiftKey: true } })
      return user
    }

    it('shows both selected', async () => {
      await selectBoth()
      expect(trackRow(1)).toBeSelected()
      expect(trackRow(2)).toBeSelected()
    })

    describe('when the pencil is pressed on one of them', () => {
      const openBulk = async () => {
        const user = await selectBoth()
        await user.press(
          screen.getByRole('button', { name: 'Edit metadata of track 2' }),
        )
        return user
      }

      it('edits both', async () => {
        await openBulk()
        expect(
          form().getByRole('header', { name: '2 tracks' }),
        ).toBeOnTheScreen()
      })

      it('shows differing artists as mixed', async () => {
        await openBulk()
        expect(await field('Artist', 'Mixed')).toBeOnTheScreen()
      })

      it('shows the album they share', async () => {
        await openBulk()
        expect(await field('Album', 'Live')).toBeOnTheScreen()
      })

      describe('and an artist is typed', () => {
        it('gives both tracks that artist', async () => {
          const user = await openBulk()
          await editField(user, 'Artist', 'Mixed', 'Both', '')
          expect(
            await screen.findByLabelText('Track 1 artist: Both'),
          ).toBeOnTheScreen()
          expect(
            screen.getByLabelText('Track 2 artist: Both'),
          ).toBeOnTheScreen()
        })
      })
    })
  })

  describe('given a slice the recorder placed without a gap to line it up with', () => {
    const unsnapped: Marker = {
      atMs: 30_000,
      title: 'Side B',
      tags: guest,
      partial: false,
      ad: false,
      unsnapped: true,
    }

    beforeEach(() => {
      fakeEditor.setDraft(sideA.fileName, taggedDraft)
      fakeEditor.setMarkers(sideA.fileName, [unsnapped])
    })

    it('asks to check that cut in the track list', async () => {
      await openEditor()
      expect(screen.getByLabelText('Check this cut')).toBeOnTheScreen()
    })

    it('asks to check it on the slice', async () => {
      await openEditor()
      expect(
        screen.getByLabelText('Slice Side B at 0:30.0, check this cut'),
      ).toBeOnTheScreen()
    })

    describe('when the slice is moved', () => {
      it('stops asking', async () => {
        await openEditor()
        const edge = screen.getByLabelText(
          'Slice Side B at 0:30.0, check this cut',
        )
        await fireEvent(edge, 'responderGrant', at(0))
        await fireEvent(edge, 'responderMove', at(2000))
        await fireEvent(edge, 'responderRelease', at(2000))
        expect(screen.queryByLabelText('Check this cut')).not.toBeOnTheScreen()
      })
    })
  })
})

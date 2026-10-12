import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tags } from '@/bridge/NativeSoundScraper'
import { fakeCore, recording } from '@test/fakes/NativeSoundScraper'

import { DetailsPane } from './DetailsPane'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

const onRenamed = vi.fn()

const renderDetailsPane = (fileNames: readonly string[]) =>
  render(
    <DetailsPane
      fileNames={fileNames}
      onRenamed={onRenamed}
      onChanged={vi.fn()}
      onClose={vi.fn()}
      textStyle={{}}
      isDark={false}
    />,
  )

/** The button showing a field's value (press it to edit in place). */
const field = (label: string, value: string) =>
  screen.findByRole('button', { name: `${label}: ${value}. Click to edit.` })

/**
 * Presses a field, deletes the text it opens with (`shown`: its value, or
 * nothing when it shows none), types `text` and presses Enter.
 */
const editField = async (
  label: string,
  value: string,
  text: string,
  shown = value,
) => {
  const user = userEvent.setup()
  await user.press(await field(label, value))
  await user.type(
    screen.getByDisplayValue(shown),
    '{Backspace}'.repeat(shown.length) + text,
    { submitEditing: true },
  )
}

const oneRecording = (tags: Partial<Tags> = {}) => {
  fakeCore.setRecordings(
    [recording('Song.mp3', { durationMs: 61_000, sizeBytes: 2_500_000 })],
    { 'Song.mp3': { title: 'Old title', artist: 'Someone', ...tags } },
  )
}

/** Holds the next tag read until the test lets it go. */
const holdNextRead = () => {
  let release = () => {}
  const held = new Promise<undefined>(resolve => {
    release = () => {
      resolve(undefined)
    }
  })
  const read = fakeCore.native.readTags.getMockImplementation()
  fakeCore.native.readTags.mockImplementationOnce(async (fileName: string) => {
    await held
    if (!read) {
      throw new Error('readTags has no fake')
    }
    return read(fileName)
  })
  return { resolve: release }
}

/** Makes the next tag read fail with `message`. */
const failNextRead = (message: string) => {
  fakeCore.native.readTags.mockImplementationOnce(() =>
    Promise.reject(new Error(message)),
  )
}

describe('the details pane', () => {
  beforeEach(() => {
    fakeCore.reset()
    onRenamed.mockClear()
  })

  describe('while the tags are read', () => {
    it('shows a spinner and no fields', async () => {
      oneRecording()
      holdNextRead()
      await renderDetailsPane(['Song.mp3'])
      expect(screen.getByLabelText('Reading the tags')).toBeOnTheScreen()
      expect(
        screen.queryByRole('button', { name: /^Title: / }),
      ).not.toBeOnTheScreen()
    })

    it('shows the tags once they are read', async () => {
      oneRecording()
      const held = holdNextRead()
      await renderDetailsPane(['Song.mp3'])
      held.resolve()
      expect(await field('Title', 'Old title')).toBeOnTheScreen()
      expect(screen.queryByLabelText('Reading the tags')).not.toBeOnTheScreen()
    })
  })

  describe('when the tags cannot be read', () => {
    it('says why, with Retry', async () => {
      oneRecording()
      failNextRead('Disk on fire')
      await renderDetailsPane(['Song.mp3'])
      expect(
        await screen.findByText("Couldn't read the tags: Disk on fire"),
      ).toBeOnTheScreen()
      expect(screen.getByText('Retry')).toBeOnTheScreen()
    })

    it('reads them again on Retry', async () => {
      const user = userEvent.setup()
      oneRecording()
      failNextRead('Disk on fire')
      await renderDetailsPane(['Song.mp3'])
      await user.press(await screen.findByText('Retry'))
      expect(await field('Title', 'Old title')).toBeOnTheScreen()
      expect(
        screen.queryByText("Couldn't read the tags: Disk on fire"),
      ).not.toBeOnTheScreen()
    })
  })

  describe('when a save is read back', () => {
    it('keeps showing the fields, not the spinner', async () => {
      oneRecording()
      await renderDetailsPane(['Song.mp3'])
      await field('Title', 'Old title')
      const held = holdNextRead()
      await editField('Title', 'Old title', 'New title')
      expect(screen.queryByLabelText('Reading the tags')).not.toBeOnTheScreen()
      expect(
        screen.getByRole('button', { name: /^Artist: / }),
      ).toBeOnTheScreen()
      held.resolve()
      expect(await field('Title', 'New title')).toBeOnTheScreen()
    })
  })

  describe('given one recording', () => {
    beforeEach(() => {
      oneRecording()
    })

    it('shows its file name and tags', async () => {
      await renderDetailsPane(['Song.mp3'])
      expect(await field('File name', 'Song')).toBeOnTheScreen()
      expect(await field('Title', 'Old title')).toBeOnTheScreen()
      expect(await field('Artist', 'Someone')).toBeOnTheScreen()
      expect(await field('Album', 'empty')).toBeOnTheScreen()
    })

    it('shows its duration, size and file', async () => {
      await renderDetailsPane(['Song.mp3'])
      expect(await screen.findByText('1:01')).toBeOnTheScreen()
      expect(screen.getByText('2.4 MB')).toBeOnTheScreen()
      expect(screen.getByText('Song.mp3')).toBeOnTheScreen()
    })

    describe('when the title is edited and Enter is pressed', () => {
      it('shows the new title', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Title', 'Old title', 'New title')
        expect(await field('Title', 'New title')).toBeOnTheScreen()
      })

      it('saves the new title to the file', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Title', 'Old title', 'New title')
        await field('Title', 'New title')
        expect(fakeCore.tagsOf('Song.mp3').title).toBe('New title')
      })

      it('leaves the other tags as they were', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Title', 'Old title', 'New title')
        await field('Title', 'New title')
        expect(fakeCore.tagsOf('Song.mp3').artist).toBe('Someone')
      })
    })

    describe('when a tag is saved with spaces around it', () => {
      it('saves it trimmed', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Album', 'empty', '  Live  ', '')
        expect(await field('Album', 'Live')).toBeOnTheScreen()
        expect(fakeCore.tagsOf('Song.mp3').album).toBe('Live')
      })
    })

    describe('when a tag is cleared', () => {
      it('removes it from the file', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Artist', 'Someone', ' ')
        expect(await field('Artist', 'empty')).toBeOnTheScreen()
        expect(fakeCore.tagsOf('Song.mp3').artist).toBeNull()
      })
    })

    describe('when a whole number is saved as the track', () => {
      it('saves the track number', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Track #', 'empty', '7', '')
        expect(await field('Track #', '7')).toBeOnTheScreen()
        expect(fakeCore.tagsOf('Song.mp3').track).toBe(7)
      })
    })

    describe('when the track is not a whole number', () => {
      it('says the track must be a whole number', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Track #', 'empty', 'x', '')
        expect(
          await screen.findByText('Track # must be a whole number'),
        ).toBeOnTheScreen()
      })

      it('keeps the field open with what was typed', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Track #', 'empty', 'x', '')
        expect(await screen.findByDisplayValue('x')).toBeOnTheScreen()
      })

      it('saves nothing', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Track #', 'empty', 'x', '')
        await screen.findByText('Track # must be a whole number')
        expect(fakeCore.native.writeTags).not.toHaveBeenCalled()
      })
    })

    describe('when the date is a year and month', () => {
      it('saves the date', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Year / date', 'empty', '2026-10', '')
        expect(await field('Year / date', '2026-10')).toBeOnTheScreen()
        expect(fakeCore.tagsOf('Song.mp3').date).toBe('2026-10')
      })
    })

    describe('when the date is not in year-month-day order', () => {
      it('shows the date formats it takes', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('Year / date', 'empty', '10/3/2026', '')
        expect(
          await screen.findByText('Use 2026, 2026-10 or 2026-10-03'),
        ).toBeOnTheScreen()
        expect(fakeCore.native.writeTags).not.toHaveBeenCalled()
      })
    })

    describe('given the settings write ID3 v2.3 tags', () => {
      it('asks the core for v2.3 tags', async () => {
        fakeCore.setSettings({ id3Version: '2.3' })
        await renderDetailsPane(['Song.mp3'])
        await editField('Title', 'Old title', 'New title')
        await field('Title', 'New title')
        expect(fakeCore.native.writeTags).toHaveBeenCalledWith(
          ['Song.mp3'],
          expect.objectContaining({ id3v23: true }),
        )
      })
    })

    describe('when the file name is edited and Enter is pressed', () => {
      it('renames the file', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('File name', 'Song', 'New name')
        expect(fakeCore.recordings().map(r => r.fileName)).toEqual([
          'New name.mp3',
        ])
      })

      it('reports the new file name', async () => {
        await renderDetailsPane(['Song.mp3'])
        await editField('File name', 'Song', 'New name')
        expect(onRenamed).toHaveBeenCalledWith('Song.mp3', 'New name.mp3')
      })
    })

    describe('given it has no cover', () => {
      it('invites choosing or dropping an image', async () => {
        await renderDetailsPane(['Song.mp3'])
        expect(
          await screen.findByText('No cover\nClick or drop an image'),
        ).toBeOnTheScreen()
      })
    })

    describe('when the cover is pressed and an image is chosen', () => {
      it('sets the image as the cover', async () => {
        const user = userEvent.setup()
        fakeCore.setPick('/Users/me/Pictures/cover.png')
        await renderDetailsPane(['Song.mp3'])
        await user.press(
          await screen.findByRole('button', { name: /^Cover art/ }),
        )
        expect(
          await screen.findByRole('image', { name: 'Cover' }),
        ).toBeOnTheScreen()
        expect(fakeCore.tagsOf('Song.mp3').coverPath).toBe(
          '/Users/me/Pictures/cover.png',
        )
      })
    })
  })

  describe('given a recording with a cover in a folder with spaces', () => {
    it('shows the cover image from that file', async () => {
      oneRecording({ coverPath: '/Users/me/My Cover.png' })
      await renderDetailsPane(['Song.mp3'])
      expect(await screen.findByRole('image', { name: 'Cover' })).toHaveProp(
        'source',
        [{ uri: 'file:///Users/me/My%20Cover.png' }],
      )
    })
  })

  describe('given a recording with a cover on a Windows drive', () => {
    it('shows the cover image from that file', async () => {
      oneRecording({ coverPath: 'C:\\covers\\a.png' })
      await renderDetailsPane(['Song.mp3'])
      expect(await screen.findByRole('image', { name: 'Cover' })).toHaveProp(
        'source',
        [{ uri: 'file:///C:/covers/a.png' }],
      )
    })
  })

  describe('given two recordings', () => {
    const twoRecordings = (cover?: { a: string | null; b: string | null }) => {
      fakeCore.setRecordings([recording('A.mp3'), recording('B.mp3')], {
        'A.mp3': {
          title: 'First',
          album: 'Same',
          track: 1,
          coverPath: cover?.a ?? null,
        },
        'B.mp3': {
          title: 'Second',
          album: 'Same',
          track: 1,
          coverPath: cover?.b ?? null,
        },
      })
    }

    it('says how many recordings it edits', async () => {
      twoRecordings()
      await renderDetailsPane(['A.mp3', 'B.mp3'])
      expect(await screen.findByText('2 recordings')).toBeOnTheScreen()
    })

    it('shows the values they share', async () => {
      twoRecordings()
      await renderDetailsPane(['A.mp3', 'B.mp3'])
      expect(await field('Album', 'Same')).toBeOnTheScreen()
      expect(await field('Track #', '1')).toBeOnTheScreen()
    })

    it('shows Mixed where their values differ', async () => {
      twoRecordings()
      await renderDetailsPane(['A.mp3', 'B.mp3'])
      expect(await field('Title', 'Mixed')).toBeOnTheScreen()
    })

    describe('when a mixed field is pressed', () => {
      it('starts editing from an empty box', async () => {
        const user = userEvent.setup()
        twoRecordings()
        await renderDetailsPane(['A.mp3', 'B.mp3'])
        await user.press(await field('Title', 'Mixed'))
        expect(screen.getByDisplayValue('')).toBeOnTheScreen()
      })
    })

    describe('when a shared field is edited', () => {
      it('saves it to both recordings', async () => {
        twoRecordings()
        await renderDetailsPane(['A.mp3', 'B.mp3'])
        await editField('Album', 'Same', 'Other')
        await field('Album', 'Other')
        expect([
          fakeCore.tagsOf('A.mp3').album,
          fakeCore.tagsOf('B.mp3').album,
        ]).toEqual(['Other', 'Other'])
      })

      it('keeps their own values in the other fields', async () => {
        twoRecordings()
        await renderDetailsPane(['A.mp3', 'B.mp3'])
        await editField('Album', 'Same', 'Other')
        await field('Album', 'Other')
        expect([
          fakeCore.tagsOf('A.mp3').title,
          fakeCore.tagsOf('B.mp3').title,
        ]).toEqual(['First', 'Second'])
      })
    })

    describe('given they share a cover', () => {
      it('shows the cover', async () => {
        twoRecordings({ a: '/covers/c.png', b: '/covers/c.png' })
        await renderDetailsPane(['A.mp3', 'B.mp3'])
        expect(await screen.findByRole('image', { name: 'Cover' })).toHaveProp(
          'source',
          [{ uri: 'file:///covers/c.png' }],
        )
      })
    })

    describe('given only one has a cover', () => {
      it('says the covers are mixed', async () => {
        twoRecordings({ a: '/covers/c.png', b: null })
        await renderDetailsPane(['A.mp3', 'B.mp3'])
        expect(await screen.findByText('Mixed covers')).toBeOnTheScreen()
      })
    })
  })
})

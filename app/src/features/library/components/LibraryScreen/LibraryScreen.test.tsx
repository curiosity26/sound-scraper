import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  within,
} from '@testing-library/react-native'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { selection } from '@/features/library/selection'
import { playback } from '@/features/playback/playback'
import { playlists } from '@/features/playlists/playlists'
import { fakeCore, recording } from '@test/fakes/NativeSoundScraper'

import { LibraryScreen } from './LibraryScreen'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

const minutes = (m: number) => m * 60_000

const onBurn = vi.fn()

/** The library, as the library panel shows it: with native menus (so
 * playlists show) when `withMenus`. */
const renderLibrary = async (withMenus = false) => {
  await render(
    <LibraryScreen
      onMessage={vi.fn()}
      textStyle={{}}
      isDark={false}
      showLibraryMenu={withMenus ? vi.fn(() => Promise.resolve(-1)) : undefined}
      onBurn={onBurn}
    />,
  )
  await screen.findByRole('button', { name: 'Sort by Name' })
}

/** Shows a playlist of these recordings in the library; returns its id. */
const showPlaylist = (fileNames: readonly string[]) => {
  const id = fakeCore.addPlaylist('Road Trip', fileNames)
  playlists.show(id)
  return id
}

/** Queries within the recordings table. */
const table = () => within(screen.getByLabelText('Recordings'))

/** The table lays itself out `width` points wide. */
const layOutTable = (width: number) =>
  fireEvent(screen.getByLabelText('Recordings'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 400 } },
  })

/** Expects the rows to show these names, in this order. */
const expectRows = (names: readonly string[]) => {
  const shown = screen.getAllByText(new RegExp(`^(${names.join('|')})$`))
  expect(shown).toHaveLength(names.length)
  names.forEach((name, i) => {
    expect(shown[i]).toHaveTextContent(name)
  })
}

/** Three recordings: newest alpha, then Bravo, then Charlie. */
const threeRecordings = () => {
  fakeCore.setRecordings([
    recording('Bravo.mp3', { recordedAtMs: 2, durationMs: minutes(3) }),
    recording('alpha.mp3', {
      recordedAtMs: 3,
      durationMs: minutes(1),
      album: 'Live',
    }),
    recording('Charlie.mp3', {
      recordedAtMs: 1,
      durationMs: minutes(2),
      artist: 'Zed',
      album: 'Days',
    }),
  ])
}

describe('the library screen', () => {
  beforeEach(() => {
    fakeCore.reset()
    // The selection is shared app state that outlives a test.
    selection.set([])
    onBurn.mockClear()
  })

  describe('given no recordings', () => {
    it('says to press Record to make one', async () => {
      await renderLibrary()
      expect(
        screen.getByText('No recordings yet. Press Record to make one.'),
      ).toBeOnTheScreen()
    })
  })

  describe('given recordings', () => {
    beforeEach(() => {
      threeRecordings()
    })

    it('lists the newest first', async () => {
      await renderLibrary()
      expectRows(['alpha', 'Bravo', 'Charlie'])
    })

    it('shows the artist and album together', async () => {
      await renderLibrary()
      expect(screen.getByText('Zed / Days')).toBeOnTheScreen()
    })

    it('counts them', async () => {
      await renderLibrary()
      expect(screen.getByText(/^Library/)).toHaveTextContent('Library 3')
    })

    describe('when Date recorded is pressed', () => {
      it('lists the oldest first', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(
          screen.getByRole('button', { name: 'Sort by Date recorded' }),
        )
        expectRows(['Charlie', 'Bravo', 'alpha'])
      })
    })

    describe('when Name is pressed', () => {
      it('sorts by name from A, ignoring case', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByRole('button', { name: 'Sort by Name' }))
        expectRows(['alpha', 'Bravo', 'Charlie'])
      })

      it('marks the column as sorted A to Z', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByRole('button', { name: 'Sort by Name' }))
        expect(screen.getByText('Name ▲')).toBeOnTheScreen()
      })
    })

    describe('when Name is pressed twice', () => {
      it('sorts by name from Z', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        const name = screen.getByRole('button', { name: 'Sort by Name' })
        await user.press(name)
        await user.press(name)
        expectRows(['Charlie', 'Bravo', 'alpha'])
      })
    })

    describe('when Duration is pressed', () => {
      it('lists the longest first', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(
          screen.getByRole('button', { name: 'Sort by Duration' }),
        )
        expectRows(['Bravo', 'Charlie', 'alpha'])
      })
    })

    describe('when Duration is pressed twice', () => {
      it('lists the shortest first', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        const duration = screen.getByRole('button', {
          name: 'Sort by Duration',
        })
        await user.press(duration)
        await user.press(duration)
        expectRows(['alpha', 'Charlie', 'Bravo'])
      })
    })

    describe('when searching for an artist', () => {
      it('shows only their recordings', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.type(screen.getByPlaceholderText('Search'), 'zed')
        expectRows(['Charlie'])
      })

      it('counts the matches out of every recording', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.type(screen.getByPlaceholderText('Search'), 'zed')
        expect(screen.getByText(/^Library/)).toHaveTextContent('Library 1 of 3')
      })
    })

    describe('when searching for something no recording has', () => {
      it('says no recordings match', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.type(screen.getByPlaceholderText('Search'), 'jazz')
        expect(
          screen.getByText('No recordings match your search.'),
        ).toBeOnTheScreen()
      })
    })

    describe('given the table is wide', () => {
      it('shows every column', async () => {
        await renderLibrary()
        await layOutTable(700)
        expect(
          screen.getByRole('button', { name: 'Sort by Artist / Album' }),
        ).toBeOnTheScreen()
      })
    })

    describe('given the table is too narrow for artists', () => {
      it('hides the Artist / Album column', async () => {
        await renderLibrary()
        await layOutTable(500)
        expect(
          screen.queryByRole('button', { name: 'Sort by Artist / Album' }),
        ).not.toBeOnTheScreen()
      })

      it('hides the artists and albums in the rows', async () => {
        await renderLibrary()
        await layOutTable(500)
        expect(screen.queryByText('Zed / Days')).not.toBeOnTheScreen()
      })

      it('still shows the sizes', async () => {
        await renderLibrary()
        await layOutTable(500)
        expect(
          screen.getByRole('button', { name: 'Sort by Size' }),
        ).toBeOnTheScreen()
      })
    })

    describe('given the table is too narrow for sizes', () => {
      it('hides the Size column', async () => {
        await renderLibrary()
        await layOutTable(400)
        expect(
          screen.queryByRole('button', { name: 'Sort by Size' }),
        ).not.toBeOnTheScreen()
      })

      it('still shows the name, duration and date', async () => {
        await renderLibrary()
        await layOutTable(400)
        expect(
          ['Name', 'Duration', 'Date recorded'].map(column =>
            screen.queryByRole('button', { name: `Sort by ${column}` }),
          ),
        ).not.toContain(null)
      })
    })

    describe('when two recordings are checked', () => {
      it('offers to edit both', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByRole('checkbox', { name: 'Select alpha' }))
        await user.press(screen.getByRole('checkbox', { name: 'Select Bravo' }))
        expect(
          screen.getByRole('button', { name: 'Edit 2 selected' }),
        ).toBeOnTheScreen()
      })
    })

    describe('when Edit 2 selected is pressed', () => {
      it('shows both in the details', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByRole('checkbox', { name: 'Select alpha' }))
        await user.press(screen.getByRole('checkbox', { name: 'Select Bravo' }))
        await user.press(
          screen.getByRole('button', { name: 'Edit 2 selected' }),
        )
        expect(await screen.findByText('2 recordings')).toBeOnTheScreen()
      })
    })

    describe('when Select all is pressed', () => {
      it('checks every recording', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByRole('checkbox', { name: 'Select all' }))
        expect(
          screen.getByRole('button', { name: 'Edit 3 selected' }),
        ).toBeOnTheScreen()
      })
    })
  })

  describe('given recordings with titles, artists and albums', () => {
    beforeEach(() => {
      fakeCore.setRecordings([
        recording('Morning.mp3', {
          recordedAtMs: 3,
          title: 'Sunrise set',
          artist: 'Zed',
        }),
        recording('Evening.mp3', { recordedAtMs: 2, album: 'Live at Home' }),
        recording('Night.mp3', { recordedAtMs: 1 }),
      ])
    })

    /** Types `query` in the search box. */
    const search = async (query: string) => {
      const user = userEvent.setup()
      await renderLibrary()
      await user.type(screen.getByPlaceholderText('Search'), query)
    }

    describe('when searching for a file name', () => {
      it('shows only that recording', async () => {
        await search('night')
        expectRows(['Night'])
      })
    })

    describe('when searching for a title', () => {
      it('shows only the recording with that title', async () => {
        await search('sunrise')
        expectRows(['Morning'])
      })
    })

    describe('when searching for an album', () => {
      it('shows only the recordings on it', async () => {
        await search('live')
        expectRows(['Evening'])
      })
    })

    describe('when searching in capitals', () => {
      it('ignores case', async () => {
        await search('LIVE AT')
        expectRows(['Evening'])
      })
    })

    describe('when searching with spaces around the words', () => {
      it('ignores the spaces', async () => {
        await search('  zed  ')
        expectRows(['Morning'])
      })
    })

    describe('when searching for only spaces', () => {
      it('shows every recording', async () => {
        await search('   ')
        expectRows(['Morning', 'Evening', 'Night'])
      })
    })
  })

  describe('given a recording a minute and five seconds long', () => {
    it('shows its duration in minutes and seconds', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 65_000 })])
      await renderLibrary()
      expect(table().getByText('1:05')).toBeOnTheScreen()
    })
  })

  describe('given a recording a minute and 5.4 seconds long', () => {
    it('shows its duration to the nearest second', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 65_400 })])
      await renderLibrary()
      expect(table().getByText('1:05')).toBeOnTheScreen()
    })
  })

  describe('given a recording over an hour long', () => {
    it('shows its duration in hours, minutes and seconds', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 3_725_000 })])
      await renderLibrary()
      expect(table().getByText('1:02:05')).toBeOnTheScreen()
    })
  })

  describe('given a recording with nothing in it', () => {
    it('shows its duration as 0:00', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 0 })])
      await renderLibrary()
      expect(table().getByText('0:00')).toBeOnTheScreen()
    })
  })

  describe('given a recording of 2,500,000 bytes', () => {
    it('shows its size in megabytes to one decimal place', async () => {
      fakeCore.setRecordings([recording('a.mp3', { sizeBytes: 2_500_000 })])
      await renderLibrary()
      await layOutTable(700)
      expect(table().getByText('2.4 MB')).toBeOnTheScreen()
    })
  })

  describe('given a recording under a megabyte', () => {
    it('shows its size in kilobytes', async () => {
      fakeCore.setRecordings([recording('a.mp3', { sizeBytes: 512_000 })])
      await renderLibrary()
      await layOutTable(700)
      expect(table().getByText('500 KB')).toBeOnTheScreen()
    })
  })

  describe('given a recording of a few bytes', () => {
    it('shows its size as 1 KB', async () => {
      fakeCore.setRecordings([recording('a.mp3', { sizeBytes: 300 })])
      await renderLibrary()
      await layOutTable(700)
      expect(table().getByText('1 KB')).toBeOnTheScreen()
    })
  })

  describe('given a recording', () => {
    beforeEach(() => {
      fakeCore.setRecordings([recording('Delta.mp3')])
    })

    // The loaded recording is shared app state that outlives a test.
    afterEach(() => {
      playback.clear()
    })

    describe('when it is pressed', () => {
      it('shows its details beside the table', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByText('Delta'))
        expect(
          await screen.findByRole('button', {
            name: 'File name: Delta. Click to edit.',
          }),
        ).toBeOnTheScreen()
      })

      it('marks it as loaded for playback', async () => {
        const user = userEvent.setup()
        await renderLibrary()
        await user.press(screen.getByText('Delta'))
        expect(await screen.findByText('▶ Delta')).toBeOnTheScreen()
      })
    })

    describe('given it is loaded for playback', () => {
      describe('when the player unloads it', () => {
        it('no longer marks it as loaded', async () => {
          const user = userEvent.setup()
          await renderLibrary()
          await user.press(screen.getByText('Delta'))
          await screen.findByText('▶ Delta')
          await act(() => {
            fakeCore.native.playerUnload()
          })
          expect(await table().findByText('Delta')).toBeOnTheScreen()
          expect(table().queryByText('▶ Delta')).not.toBeOnTheScreen()
        })
      })

      describe('when it is unloaded and pressed again', () => {
        it('loads it again', async () => {
          const user = userEvent.setup()
          await renderLibrary()
          await user.press(screen.getByText('Delta'))
          await screen.findByText('▶ Delta')
          await act(() => {
            fakeCore.native.playerUnload()
          })
          await user.press(await table().findByText('Delta'))
          expect(await table().findByText('▶ Delta')).toBeOnTheScreen()
          expect(fakeCore.native.playerLoad).toHaveBeenCalledTimes(2)
        })
      })
    })
  })

  describe('given a playlist with a missing recording is showing', () => {
    let playlistId = 0

    beforeEach(() => {
      fakeCore.setRecordings([
        recording('a.mp3', { durationMs: minutes(2) }),
        recording('b.mp3', { durationMs: minutes(1), artist: 'Miles' }),
      ])
      playlistId = showPlaylist(['b.mp3', 'gone.mp3', 'a.mp3'])
    })

    it('lists the rows in the playlist’s order', async () => {
      await renderLibrary(true)
      expectRows(['b', 'gone', 'a'])
    })

    it('numbers the rows from 1', async () => {
      await renderLibrary(true)
      expectRows(['1', '2', '3'])
    })

    it('marks the missing recording', async () => {
      await renderLibrary(true)
      expect(screen.getByText('missing')).toBeOnTheScreen()
    })

    it('leaves the missing recording out of the CD', async () => {
      await renderLibrary(true)
      expect(
        screen.getByText('2 tracks · 3:00 (+0:04 gaps) · 1 missing'),
      ).toBeOnTheScreen()
    })

    describe('when Name is pressed', () => {
      it('sorts by name with the missing recording last', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('button', { name: 'Sort by Name' }))
        expectRows(['a', 'b', 'gone'])
      })

      it('offers no reordering', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('button', { name: 'Sort by Name' }))
        await user.press(screen.getByRole('checkbox', { name: 'Select a' }))
        expect(
          screen.queryByRole('button', { name: 'Move up' }),
        ).not.toBeOnTheScreen()
      })
    })

    describe('when # is pressed', () => {
      it('lists the rows in reverse order', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('button', { name: 'Sort by #' }))
        expectRows(['a', 'gone', 'b'])
      })
    })

    describe('when searching for an artist', () => {
      it('shows only their rows', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.type(screen.getByPlaceholderText('Search'), 'miles')
        expectRows(['b'])
      })
    })

    describe('when searching for the missing file’s name', () => {
      it('shows the missing row', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.type(screen.getByPlaceholderText('Search'), 'gone')
        expectRows(['gone'])
      })
    })

    describe('when searching for something no row has', () => {
      it('says nothing in the playlist matches', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.type(screen.getByPlaceholderText('Search'), 'jazz')
        expect(
          screen.getByText('Nothing in this playlist matches your search.'),
        ).toBeOnTheScreen()
      })
    })

    describe('when a row is checked and Move up is pressed', () => {
      it('moves the row up one place', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select a' }))
        await user.press(screen.getByRole('button', { name: 'Move up' }))
        expectRows(['b', 'a', 'gone'])
      })

      it('saves the new order', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select a' }))
        await user.press(screen.getByRole('button', { name: 'Move up' }))
        expect(fakeCore.playlistFiles(playlistId)).toEqual([
          'b.mp3',
          'a.mp3',
          'gone.mp3',
        ])
      })
    })

    describe('when the first row is checked and Move up is pressed', () => {
      it('leaves the order as it was', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select b' }))
        await user.press(screen.getByRole('button', { name: 'Move up' }))
        expectRows(['b', 'gone', 'a'])
      })
    })

    describe('when the last row is checked and Move down is pressed', () => {
      it('leaves the order as it was', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select a' }))
        await user.press(screen.getByRole('button', { name: 'Move down' }))
        expectRows(['b', 'gone', 'a'])
      })
    })

    describe('when a row is checked and Remove is pressed', () => {
      it('takes the row out of the playlist', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select gone' }))
        await user.press(screen.getByRole('button', { name: 'Remove' }))
        expect(fakeCore.playlistFiles(playlistId)).toEqual(['b.mp3', 'a.mp3'])
      })

      it('no longer lists it', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select gone' }))
        await user.press(screen.getByRole('button', { name: 'Remove' }))
        expectRows(['b', 'a'])
      })
    })
  })

  describe('given a playlist of four is showing', () => {
    beforeEach(() => {
      fakeCore.setRecordings(
        ['w', 'x', 'y', 'z'].map(n => recording(`${n}.mp3`)),
      )
      showPlaylist(['w.mp3', 'x.mp3', 'y.mp3', 'z.mp3'])
    })

    describe('when two rows apart are checked and Move up is pressed', () => {
      it('moves them up together, in their order', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select x' }))
        await user.press(screen.getByRole('checkbox', { name: 'Select z' }))
        await user.press(screen.getByRole('button', { name: 'Move up' }))
        expectRows(['x', 'z', 'w', 'y'])
      })
    })

    describe('when two rows apart are checked and Move down is pressed', () => {
      it('moves them down together, in their order', async () => {
        const user = userEvent.setup()
        await renderLibrary(true)
        await user.press(screen.getByRole('checkbox', { name: 'Select w' }))
        await user.press(screen.getByRole('checkbox', { name: 'Select y' }))
        await user.press(screen.getByRole('button', { name: 'Move down' }))
        expectRows(['x', 'z', 'w', 'y'])
      })
    })
  })

  describe('given an empty playlist is showing', () => {
    beforeEach(() => {
      showPlaylist([])
    })

    it('says how to add recordings to it', async () => {
      await renderLibrary(true)
      expect(
        screen.getByText(
          'This playlist is empty. Choose + Add Recordings… above, or record while it is showing.',
        ),
      ).toBeOnTheScreen()
    })

    it('says to add recordings to burn a CD', async () => {
      await renderLibrary(true)
      expect(screen.getByText('Add recordings to burn a CD.')).toBeOnTheScreen()
    })

    it('cannot be burned', async () => {
      await renderLibrary(true)
      expect(
        screen.getByRole('button', { name: 'Save CD Image…' }),
      ).toBeDisabled()
    })
  })

  describe('given a playlist of only missing recordings is showing', () => {
    it('says every track is missing', async () => {
      showPlaylist(['gone.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Every track here is missing from the library.'),
      ).toBeOnTheScreen()
    })
  })

  describe('given a playlist of two half-hour recordings is showing', () => {
    beforeEach(() => {
      fakeCore.setRecordings([
        recording('a.mp3', { durationMs: minutes(30), title: 'A side' }),
        recording('b.mp3', { durationMs: minutes(30), artist: 'Miles' }),
      ])
    })

    it('sums the music and the gaps between tracks', async () => {
      showPlaylist(['a.mp3', 'b.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('2 tracks · 60:00 (+0:04 gaps)'),
      ).toBeOnTheScreen()
    })

    it('says it fits a 74-minute CD and what is left', async () => {
      showPlaylist(['a.mp3', 'b.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Fits a 74-minute CD with 13:56 to spare'),
      ).toBeOnTheScreen()
    })

    describe('when Save CD Image… is pressed', () => {
      it('burns the playlist’s tracks', async () => {
        const user = userEvent.setup()
        const id = showPlaylist(['a.mp3', 'b.mp3'])
        await renderLibrary(true)
        await user.press(screen.getByRole('button', { name: 'Save CD Image…' }))
        expect(onBurn).toHaveBeenCalledWith({
          playlistId: id,
          name: 'Road Trip',
          tracks: [
            {
              path: '/Users/me/Music/Sound Scraper/a.mp3',
              title: 'A side',
              performer: null,
              durationMs: minutes(30),
            },
            {
              path: '/Users/me/Music/Sound Scraper/b.mp3',
              title: 'b',
              performer: 'Miles',
              durationMs: minutes(30),
            },
          ],
        })
      })
    })
  })

  describe('given a playlist longer than 74 minutes is showing', () => {
    it('says it needs an 80-minute CD and what is left', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: minutes(77) })])
      showPlaylist(['a.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Needs an 80-minute CD (2:55 to spare)'),
      ).toBeOnTheScreen()
    })
  })

  describe('given a playlist too long for any CD is showing', () => {
    beforeEach(() => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: minutes(81) })])
      showPlaylist(['a.mp3'])
    })

    it('says how much too long it is', async () => {
      await renderLibrary(true)
      expect(
        screen.getByText('1:05 too long for a CD: remove a track or two'),
      ).toBeOnTheScreen()
    })

    it('cannot be burned', async () => {
      await renderLibrary(true)
      expect(
        screen.getByRole('button', { name: 'Save CD Image…' }),
      ).toBeDisabled()
    })
  })

  describe('given a playlist of a one-second recording is showing', () => {
    it('counts it as the 4 seconds a CD track takes at least', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 1000 })])
      showPlaylist(['a.mp3'])
      await renderLibrary(true)
      expect(screen.getByText('1 track · 0:04 (+0:02 gaps)')).toBeOnTheScreen()
    })
  })

  describe('given a playlist exactly as long as a 74-minute CD holds is showing', () => {
    it('says it fits a 74-minute CD with nothing to spare', async () => {
      // 73:58 of music and the 2-second pregap before the first track.
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 4_438_000 })])
      showPlaylist(['a.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Fits a 74-minute CD with 0:00 to spare'),
      ).toBeOnTheScreen()
    })
  })

  describe('given a playlist a millisecond longer than a 74-minute CD holds is showing', () => {
    it('says it needs an 80-minute CD, as the millisecond takes a whole sector', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 4_438_001 })])
      showPlaylist(['a.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Needs an 80-minute CD (5:57 to spare)'),
      ).toBeOnTheScreen()
    })
  })

  describe('given a playlist exactly as long as an 80-minute CD holds is showing', () => {
    it('says it needs an 80-minute CD with nothing to spare', async () => {
      // An 80-minute blank holds 79:57; 79:55 of music and the pregap.
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 4_795_000 })])
      showPlaylist(['a.mp3'])
      await renderLibrary(true)
      expect(
        screen.getByText('Needs an 80-minute CD (0:00 to spare)'),
      ).toBeOnTheScreen()
    })
  })

  describe('given a playlist that runs past 80 minutes after a missing recording is showing', () => {
    it('marks the tracks past the end of an 80-minute CD', async () => {
      fakeCore.setRecordings([
        recording('a.mp3', { durationMs: minutes(40) }),
        recording('c.mp3', { durationMs: minutes(39) }),
        recording('d.mp3', { durationMs: minutes(5) }),
      ])
      showPlaylist(['a.mp3', 'gone.mp3', 'c.mp3', 'd.mp3'])
      await renderLibrary(true)
      // Only the last row, d: the missing row doesn't count toward the CD.
      const marked = screen.getAllByHintText("Won't fit on an 80-minute CD")
      expect(marked.map(row => within(row).queryByText('d') !== null)).toEqual([
        true,
      ])
    })
  })

  describe('given a playlist of 100 tracks is showing', () => {
    it('says a CD holds at most 99', async () => {
      fakeCore.setRecordings([recording('a.mp3', { durationMs: 5000 })])
      showPlaylist(Array.from({ length: 100 }, () => 'a.mp3'))
      await renderLibrary(true)
      expect(
        screen.getByText('100 tracks: a CD holds at most 99'),
      ).toBeOnTheScreen()
    })
  })
})

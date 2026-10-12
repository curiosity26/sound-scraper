import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Device, Media } from '@/bridge/generated'
import { burnJob } from '@/features/burn/burnJob'
import { burnTarget } from '@/features/burn/burnTarget'
import { openBurnPanel } from '@/features/burn/openBurnPanel'
import { burnStatus, fakeBurner } from '@test/fakes/fakeBurner'
import { fakeCore, recording } from '@test/fakes/NativeSoundScraper'

import { BurnPanel } from './BurnPanel'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)

/** 74:00 of audio sectors, what a 74-minute blank holds. */
const SECTORS_74 = 74 * 60 * 75

const drive = (media: Partial<Media> = {}): Device => ({
  id: 'drive',
  name: 'CD Burner',
  kind: 'drive',
  media: {
    state: 'blank',
    kind: 'CD-R',
    capacity: SECTORS_74,
    label: 'CD-R 74 min, blank',
    ...media,
  },
  speeds: [],
  canTest: false,
  gapless: true,
  cdText: true,
})

const imageWriter: Device = {
  id: 'image',
  name: 'Disc Image',
  kind: 'image',
  media: { state: 'image', kind: null, capacity: 359_775, label: '.cue/.bin' },
  speeds: [],
  canTest: false,
  gapless: true,
  cdText: true,
}

const hasDevices = (...devices: Device[]) => {
  fakeBurner.setDevices({ devices, simulator: false })
}

/** Burn CD… on a playlist of one recording `minutes` long. */
const chooseBurnCd = (minutes: number) => {
  const side = recording('Side A.mp3', { durationMs: minutes * 60_000 })
  fakeCore.setRecordings([side])
  const playlistId = fakeCore.addPlaylist('Mixtape', [side.fileName])
  openBurnPanel(
    {
      playlistId,
      name: 'Mixtape',
      tracks: [
        {
          path: side.path,
          title: side.title,
          performer: side.artist,
          durationMs: side.durationMs,
        },
      ],
    },
    () => {},
  )
}

const pressBurn = async () => {
  const user = userEvent.setup()
  await render(<BurnPanel />)
  await user.press(screen.getByRole('button', { name: 'Burn' }))
}

describe('the burn panel', () => {
  beforeEach(() => {
    fakeCore.reset()
    burnJob.set(null)
    burnTarget.set(null)
  })

  describe('given no playlist was chosen', () => {
    it('says how to choose one', async () => {
      await render(<BurnPanel />)
      expect(
        screen.getByText(
          'Show a playlist in the library and choose Burn CD… to burn it here.',
        ),
      ).toBeOnTheScreen()
    })
  })

  describe('given an hour of audio and a blank 74-minute CD-R', () => {
    beforeEach(() => {
      hasDevices(drive())
      chooseBurnCd(60)
    })

    it('offers to burn', async () => {
      await render(<BurnPanel />)
      expect(screen.getByRole('button', { name: 'Burn' })).toBeEnabled()
    })

    it('says how long it runs and how much room is left', async () => {
      await render(<BurnPanel />)
      expect(
        screen.getByText('60:02 with gaps · fits (13:58 free)'),
      ).toBeOnTheScreen()
    })

    describe('when Burn is pressed', () => {
      it('starts burning the playlist on the drive', async () => {
        await pressBurn()
        expect(fakeBurner.started()).toEqual([
          expect.objectContaining({
            deviceId: 'drive',
            title: 'Mixtape',
            tracks: [expect.objectContaining({ title: 'Side A' })],
          }),
        ])
      })
    })
  })

  describe('given a CD-RW with something on it', () => {
    beforeEach(() => {
      hasDevices(drive({ state: 'erasable', kind: 'CD-RW' }))
      chooseBurnCd(60)
    })

    it('offers to erase and burn', async () => {
      await render(<BurnPanel />)
      expect(
        screen.getByRole('button', { name: 'Erase and Burn' }),
      ).toBeEnabled()
    })

    describe('when Erase and Burn is pressed', () => {
      it('asks before erasing the disc', async () => {
        const user = userEvent.setup()
        await render(<BurnPanel />)
        await user.press(screen.getByRole('button', { name: 'Erase and Burn' }))
        expect(screen.getByText('Erase the CD-RW?')).toBeOnTheScreen()
      })
    })
  })

  describe('given a CD burner and the disc image writer', () => {
    beforeEach(() => {
      hasDevices(drive(), imageWriter)
      chooseBurnCd(60)
    })

    describe('when the disc image is chosen to write to', () => {
      it('offers to save the image', async () => {
        const user = userEvent.setup()
        await render(<BurnPanel />)
        await user.press(screen.getByRole('radio', { name: /Disc Image/ }))
        expect(
          screen.getByRole('button', { name: 'Save Image…' }),
        ).toBeEnabled()
      })
    })
  })

  describe('given the burner has no disc in it', () => {
    beforeEach(() => {
      hasDevices(drive({ state: 'none', kind: null, capacity: null }))
      chooseBurnCd(60)
    })

    it("can't burn", async () => {
      await render(<BurnPanel />)
      expect(screen.getByRole('button', { name: 'Burn' })).toBeDisabled()
    })

    it('asks for a blank disc', async () => {
      await render(<BurnPanel />)
      expect(
        screen.getByText('Insert a blank CD-R or CD-RW.'),
      ).toBeOnTheScreen()
    })

    it('says how long it runs, without whether it fits', async () => {
      await render(<BurnPanel />)
      expect(screen.getByText('60:02 with gaps')).toBeOnTheScreen()
    })
  })

  describe('given 76 minutes of audio and a blank 74-minute CD-R', () => {
    beforeEach(() => {
      hasDevices(drive())
      chooseBurnCd(76)
    })

    it("can't burn", async () => {
      await render(<BurnPanel />)
      expect(screen.getByRole('button', { name: 'Burn' })).toBeDisabled()
    })

    it('says by how much it is too long, and to use an 80-minute CD-R', async () => {
      await render(<BurnPanel />)
      expect(
        screen.getByText(
          '2:02 too long for this 74-minute disc. Use an 80-minute CD-R.',
        ),
      ).toBeOnTheScreen()
    })
  })

  describe('given nowhere to burn to', () => {
    beforeEach(() => {
      hasDevices()
      chooseBurnCd(1)
    })

    it("can't burn", async () => {
      await render(<BurnPanel />)
      expect(screen.getByRole('button', { name: 'Burn' })).toBeDisabled()
    })
  })

  describe('given a burn has started', () => {
    beforeEach(() => {
      hasDevices(drive())
      chooseBurnCd(60)
    })

    describe('when the drive is writing at 24x', () => {
      it('shows the step and the speed', async () => {
        fakeBurner.setStatus(
          burnStatus({
            state: 'writing',
            phase: 'Writing track 1 of 1',
            speedX: 24,
          }),
        )
        await pressBurn()
        expect(
          await screen.findByText('Writing track 1 of 1 at 24x (4,234 KB/s)'),
        ).toBeOnTheScreen()
      })
    })

    describe('when the drive is writing without reporting its speed', () => {
      it('shows the step alone', async () => {
        fakeBurner.setStatus(
          burnStatus({ state: 'writing', phase: 'Writing track 1 of 1' }),
        )
        await pressBurn()
        expect(
          await screen.findByText('Writing track 1 of 1'),
        ).toBeOnTheScreen()
      })
    })

    describe('when it has run for a minute with an hour to go', () => {
      it('shows the time so far and the estimated total', async () => {
        fakeBurner.setStatus(
          burnStatus({
            state: 'writing',
            elapsedMs: 65_400,
            remainingMs: 3_659_600,
          }),
        )
        await pressBurn()
        expect(await screen.findByText('1:05 / ~1:02:05')).toBeOnTheScreen()
      })
    })

    describe('when it has finished', () => {
      it('shows the time it took', async () => {
        fakeBurner.setStatus(
          burnStatus({ state: 'done', elapsedMs: 3_725_000 }),
        )
        await pressBurn()
        expect(await screen.findByText('1:02:05')).toBeOnTheScreen()
      })
    })

    describe('when the drive reports the tracks', () => {
      it('lists the tracks', async () => {
        await pressBurn()
        expect(await screen.findByText('Side A')).toBeOnTheScreen()
      })

      it("shows each track's length", async () => {
        await pressBurn()
        expect(await screen.findByText('1:00:00')).toBeOnTheScreen()
      })
    })
  })
})

import { describe, expect, it } from 'vitest'

import { recording } from '@test/fakes/NativeSoundScraper'

import { SECTORS_74, SECTORS_80 } from './constants'
import { discCapacity } from './discCapacity'
import type { PlaylistRow } from './types'

const PREGAP = 150

const minutes = (m: number) => m * 60_000

/** The length of a track that takes `sectors` on the disc. */
const lengthOf = (sectors: number) => (sectors * 1000) / 75

/** Playlist rows for these track lengths (null: a missing recording). */
const rows = (lengths: readonly (number | null)[]): PlaylistRow[] =>
  lengths.map((ms, i) => ({
    item: { id: i + 1, fileName: `${i + 1}.mp3` },
    position: i + 1,
    recording:
      ms === null ? undefined : recording(`${i + 1}.mp3`, { durationMs: ms }),
  }))

describe('the CD capacity of a playlist', () => {
  describe('given no tracks', () => {
    it('is empty', () => {
      expect(discCapacity(rows([])).fit).toBe('empty')
    })
  })

  describe('given one track', () => {
    it('takes the first pregap and the track, rounded up to whole sectors', () => {
      expect(discCapacity(rows([10_001])).totalSectors).toBe(PREGAP + 751)
    })

    it('pads a track shorter than 4 seconds to 4 seconds', () => {
      expect(discCapacity(rows([1000])).totalSectors).toBe(PREGAP + 300)
    })
  })

  describe('given two half-hour tracks', () => {
    const halfHours = rows([minutes(30), minutes(30)])

    it('adds a 2-second gap between them', () => {
      expect(discCapacity(halfHours).totalSectors).toBe(
        PREGAP + 135_000 + 150 + 135_000,
      )
    })

    it('counts the pregap and the gap as gaps', () => {
      expect(discCapacity(halfHours).gapSectors).toBe(300)
    })

    it('fits a 74-minute CD', () => {
      expect(discCapacity(halfHours).fit).toBe('fits74')
    })

    it('knows what is left on a 74-minute CD', () => {
      expect(discCapacity(halfHours).spareSectors).toBe(
        SECTORS_74 - (PREGAP + 135_000 + 150 + 135_000),
      )
    })

    it('leaves the gap out when the gap is 0 seconds', () => {
      expect(discCapacity(halfHours, 0).totalSectors).toBe(PREGAP + 270_000)
    })
  })

  describe('given exactly 74 minutes', () => {
    it('fits a 74-minute CD', () => {
      expect(discCapacity(rows([lengthOf(SECTORS_74 - PREGAP)])).fit).toBe(
        'fits74',
      )
    })
  })

  describe('given one sector more than 74 minutes', () => {
    it('needs an 80-minute CD', () => {
      expect(discCapacity(rows([lengthOf(SECTORS_74 - PREGAP + 1)])).fit).toBe(
        'fits80',
      )
    })
  })

  describe('given exactly what an 80-minute CD holds', () => {
    it('needs an 80-minute CD', () => {
      expect(discCapacity(rows([lengthOf(SECTORS_80 - PREGAP)])).fit).toBe(
        'fits80',
      )
    })
  })

  describe('given a minute more than an 80-minute CD holds', () => {
    const over = discCapacity(rows([lengthOf(SECTORS_80 - PREGAP + 75 * 60)]))

    it('is too long', () => {
      expect(over.fit).toBe('tooLong')
    })

    it('knows how much too long', () => {
      expect(over.spareSectors).toBe(-75 * 60)
    })

    it('finds the first track past the end', () => {
      expect(over.firstOver).toBe(0)
    })
  })

  describe('given 100 short tracks', () => {
    it('has too many tracks', () => {
      expect(
        discCapacity(rows(Array.from({ length: 100 }, () => 5000))).fit,
      ).toBe('tooMany')
    })
  })

  describe('given a missing recording among the tracks', () => {
    const withMissing = discCapacity(
      rows([minutes(40), null, minutes(39), minutes(5)]),
    )

    it('leaves it out', () => {
      expect(withMissing.tracks).toBe(3)
    })

    it('counts it as missing', () => {
      expect(withMissing.missing).toBe(1)
    })

    it('finds the first track past 80 minutes by its row', () => {
      expect(withMissing.firstOver).toBe(3)
    })
  })

  describe('given only missing recordings', () => {
    it('is empty', () => {
      expect(discCapacity(rows([null, null])).fit).toBe('empty')
    })
  })
})

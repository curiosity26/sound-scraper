import { describe, expect, it } from 'vitest'

import {
  isArrayOf,
  isBoolean,
  isEither,
  isNullable,
  isNumber,
  isOneOf,
  isOptional,
  isRecordOf,
  isShape,
  isString,
} from '@/shared/utils/guards'

type Track = {
  title: string
  artist: string | null
  durationMs: number
  tags?: string[]
  kind: 'mp3' | 'wav'
}

const isTrack = isShape<Track>({
  title: isString,
  artist: isNullable(isString),
  durationMs: isNumber,
  tags: isOptional(isArrayOf(isString)),
  kind: isOneOf('mp3', 'wav'),
})

const track = { title: 'a', artist: null, durationMs: 1, kind: 'mp3' }

describe('the data-boundary guards', () => {
  describe('given a shape guard for a track', () => {
    describe('when every field is right and the optional one is absent', () => {
      it('accepts the value', () => {
        expect(isTrack(track)).toBe(true)
      })
    })

    describe('when the optional field is there and right', () => {
      it('accepts the value', () => {
        expect(isTrack({ ...track, tags: ['x'] })).toBe(true)
      })
    })

    describe('when the nullable field holds a value of its type', () => {
      it('accepts the value', () => {
        expect(isTrack({ ...track, artist: 'b' })).toBe(true)
      })
    })

    describe('when a one-of field holds a value not listed', () => {
      it('rejects the value', () => {
        expect(isTrack({ ...track, kind: 'ogg' })).toBe(false)
      })
    })

    describe('when a number field holds a string', () => {
      it('rejects the value', () => {
        expect(isTrack({ ...track, durationMs: '1' })).toBe(false)
      })
    })

    describe('when a list field holds an item of the wrong type', () => {
      it('rejects the value', () => {
        expect(isTrack({ ...track, tags: [1] })).toBe(false)
      })
    })

    describe('when a required field is missing', () => {
      it('rejects the value', () => {
        expect(isTrack({ artist: null, durationMs: 1, kind: 'mp3' })).toBe(
          false,
        )
      })
    })

    describe('when the value is null', () => {
      it('rejects it', () => {
        expect(isTrack(null)).toBe(false)
      })
    })
  })

  describe('given a guard for either a string or a number', () => {
    const isStringOrNumber = isEither(isString, isNumber)

    describe('when the value is a number', () => {
      it('accepts it', () => {
        expect(isStringOrNumber(2)).toBe(true)
      })
    })

    describe('when the value is neither', () => {
      it('rejects it', () => {
        expect(isStringOrNumber(true)).toBe(false)
      })
    })
  })

  describe('given a guard for a map of booleans', () => {
    const isFlags = isRecordOf(isBoolean)

    describe('when every value is a boolean', () => {
      it('accepts the map', () => {
        expect(isFlags({ a: true, b: false })).toBe(true)
      })
    })

    describe('when a value is not a boolean', () => {
      it('rejects the map', () => {
        expect(isFlags({ a: true, b: 'no' })).toBe(false)
      })
    })

    describe('when the value is a list', () => {
      it('rejects it', () => {
        expect(isFlags([true])).toBe(false)
      })
    })
  })
})

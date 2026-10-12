import { describe, expect, it } from 'vitest'

import { isOneOf } from './isOneOf'

describe('a one-of guard', () => {
  describe('given a guard for mp3 or wav', () => {
    const isKind = isOneOf('mp3', 'wav')

    describe('when the value is listed', () => {
      it('accepts it', () => {
        expect(isKind('wav')).toBe(true)
      })
    })

    describe('when the value is not listed', () => {
      it('rejects it', () => {
        expect(isKind('ogg')).toBe(false)
      })
    })
  })
})

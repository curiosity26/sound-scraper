import { describe, expect, it } from 'vitest'

import { isNullable } from './isNullable'
import { isString } from './isString'

describe('a nullable guard', () => {
  describe('given a guard for a string or null', () => {
    const isArtist = isNullable(isString)

    describe('when the value is null', () => {
      it('accepts it', () => {
        expect(isArtist(null)).toBe(true)
      })
    })

    describe('when the value is a string', () => {
      it('accepts it', () => {
        expect(isArtist('Miles')).toBe(true)
      })
    })

    describe('when the value is absent', () => {
      it('rejects it', () => {
        expect(isArtist(undefined)).toBe(false)
      })
    })

    describe('when the value is another type', () => {
      it('rejects it', () => {
        expect(isArtist(1)).toBe(false)
      })
    })
  })
})

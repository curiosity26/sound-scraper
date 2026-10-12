import { describe, expect, it } from 'vitest'

import { isOptional } from './isOptional'
import { isString } from './isString'

describe('an optional guard', () => {
  describe('given a guard for a string or nothing', () => {
    const isComment = isOptional(isString)

    describe('when the value is absent', () => {
      it('accepts it', () => {
        expect(isComment(undefined)).toBe(true)
      })
    })

    describe('when the value is a string', () => {
      it('accepts it', () => {
        expect(isComment('live')).toBe(true)
      })
    })

    describe('when the value is null', () => {
      it('rejects it', () => {
        expect(isComment(null)).toBe(false)
      })
    })
  })
})

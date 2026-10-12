import { describe, expect, it } from 'vitest'

import { isArrayOf } from './isArrayOf'
import { isString } from './isString'

describe('a list guard', () => {
  describe('given a guard for a list of strings', () => {
    const isNames = isArrayOf(isString)

    describe('when every item is a string', () => {
      it('accepts it', () => {
        expect(isNames(['a', 'b'])).toBe(true)
      })
    })

    describe('when the list is empty', () => {
      it('accepts it', () => {
        expect(isNames([])).toBe(true)
      })
    })

    describe('when an item is not a string', () => {
      it('rejects it', () => {
        expect(isNames(['a', 1])).toBe(false)
      })
    })

    describe('when the value is not a list', () => {
      it('rejects it', () => {
        expect(isNames('a')).toBe(false)
      })
    })
  })
})

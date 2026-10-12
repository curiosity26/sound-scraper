import { describe, expect, it } from 'vitest'

import { isEither } from './isEither'
import { isNumber } from './isNumber'
import { isString } from './isString'

describe('an either guard', () => {
  describe('given a guard for either a string or a number', () => {
    const isStringOrNumber = isEither(isString, isNumber)

    describe('when the value is a string', () => {
      it('accepts it', () => {
        expect(isStringOrNumber('a')).toBe(true)
      })
    })

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
})

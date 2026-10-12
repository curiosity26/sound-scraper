import { describe, expect, it } from 'vitest'

import { isBoolean } from './isBoolean'
import { isRecordOf } from './isRecordOf'

describe('a map guard', () => {
  describe('given a guard for a map of booleans', () => {
    const isFlags = isRecordOf(isBoolean)

    describe('when every value is a boolean', () => {
      it('accepts it', () => {
        expect(isFlags({ a: true, b: false })).toBe(true)
      })
    })

    describe('when a value is not a boolean', () => {
      it('rejects it', () => {
        expect(isFlags({ a: true, b: 'no' })).toBe(false)
      })
    })

    describe('when the value is a list', () => {
      it('rejects it', () => {
        expect(isFlags([true])).toBe(false)
      })
    })

    describe('when the value is null', () => {
      it('rejects it', () => {
        expect(isFlags(null)).toBe(false)
      })
    })
  })
})

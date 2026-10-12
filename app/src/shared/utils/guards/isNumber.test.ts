import { describe, expect, it } from 'vitest'

import { isNumber } from './isNumber'

describe('a number guard', () => {
  describe('when the value is a number', () => {
    it('accepts it', () => {
      expect(isNumber(1.5)).toBe(true)
    })
  })

  describe('when the value is a numeric string', () => {
    it('rejects it', () => {
      expect(isNumber('1')).toBe(false)
    })
  })
})

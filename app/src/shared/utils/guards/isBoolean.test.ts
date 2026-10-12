import { describe, expect, it } from 'vitest'

import { isBoolean } from './isBoolean'

describe('a boolean guard', () => {
  describe('when the value is a boolean', () => {
    it('accepts it', () => {
      expect(isBoolean(false)).toBe(true)
    })
  })

  describe('when the value is a number', () => {
    it('rejects it', () => {
      expect(isBoolean(0)).toBe(false)
    })
  })
})

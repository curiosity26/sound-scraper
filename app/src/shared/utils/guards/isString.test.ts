import { describe, expect, it } from 'vitest'

import { isString } from './isString'

describe('a string guard', () => {
  describe('when the value is a string', () => {
    it('accepts it', () => {
      expect(isString('a')).toBe(true)
    })
  })

  describe('when the value is a number', () => {
    it('rejects it', () => {
      expect(isString(1)).toBe(false)
    })
  })
})

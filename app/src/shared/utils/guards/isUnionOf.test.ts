import { describe, expect, it } from 'vitest'

import { isUnionOf } from './isUnionOf'

type Quality = 'cbr128' | 'cbr192' | 'v0'

const isQuality = isUnionOf<Quality>()('cbr128', 'cbr192', 'v0')

describe('a string-union guard', () => {
  describe('given a guard listing every quality', () => {
    describe('when the value is one of them', () => {
      it('accepts it', () => {
        expect(isQuality('v0')).toBe(true)
      })
    })

    describe('when the value is another string', () => {
      it('rejects it', () => {
        expect(isQuality('flac')).toBe(false)
      })
    })
  })
})

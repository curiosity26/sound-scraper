import { describe, expect, it } from 'vitest'

import { isNumber, isOneOf, isShape, isString } from '@/shared/utils/guards'

import { isVariantOf } from './isVariantOf'

type Status =
  | { state: 'loading'; progress: number }
  | { state: 'failed'; message: string }

const isStatus = isVariantOf<Status, 'state'>('state', {
  loading: isShape({ state: isOneOf('loading'), progress: isNumber }),
  failed: isShape({ state: isOneOf('failed'), message: isString }),
})

describe('a tagged-union guard', () => {
  describe('given a guard for a loading or failed status', () => {
    describe('when a value has a known tag and that variant’s fields', () => {
      it('accepts it', () => {
        expect(isStatus({ state: 'failed', message: 'No file' })).toBe(true)
      })
    })

    describe('when a value has a known tag but another variant’s fields', () => {
      it('rejects it', () => {
        expect(isStatus({ state: 'loading', message: 'No file' })).toBe(false)
      })
    })

    describe('when a value has an unknown tag', () => {
      it('rejects it', () => {
        expect(isStatus({ state: 'ready', progress: 1 })).toBe(false)
      })
    })

    describe('when the value is not an object', () => {
      it('rejects it', () => {
        expect(isStatus('loading')).toBe(false)
      })
    })
  })
})

import { describe, expect, it } from 'vitest'

import { stepIn } from './stepIn'

const steps = [1, 5, 10]

describe('stepping through a list of values', () => {
  describe('given a value in the list', () => {
    describe('when stepping up', () => {
      it('gives the next value', () => {
        expect(stepIn(steps, 5, 1)).toBe(10)
      })
    })

    describe('when stepping down', () => {
      it('gives the previous value', () => {
        expect(stepIn(steps, 5, -1)).toBe(1)
      })
    })
  })

  describe('given the last value in the list', () => {
    describe('when stepping up', () => {
      it('stays on the last value', () => {
        expect(stepIn(steps, 10, 1)).toBe(10)
      })
    })
  })

  describe('given the first value in the list', () => {
    describe('when stepping down', () => {
      it('stays on the first value', () => {
        expect(stepIn(steps, 1, -1)).toBe(1)
      })
    })
  })

  describe('given a value between two in the list', () => {
    describe('when stepping up', () => {
      it('gives the value above it', () => {
        expect(stepIn(steps, 7, 1)).toBe(10)
      })
    })

    describe('when stepping down', () => {
      it('gives the value below it', () => {
        expect(stepIn(steps, 7, -1)).toBe(5)
      })
    })
  })
})

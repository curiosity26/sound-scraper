import { describe, expect, it } from 'vitest'

import { toPercent } from './toPercent'

describe('toPercent', () => {
  it('Given a share, When written as a percent, Then it scales to 100', () => {
    expect(toPercent(0.425)).toBe('42.5%')
  })

  it('Given a share outside 0–1, When written as a percent, Then it is clamped', () => {
    expect(toPercent(-0.2)).toBe('0%')
    expect(toPercent(1.5)).toBe('100%')
  })
})

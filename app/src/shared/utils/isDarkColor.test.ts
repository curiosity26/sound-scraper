import { describe, expect, it } from 'vitest'

import { isDarkColor } from './isDarkColor'

describe('telling dark colors from light ones', () => {
  it('takes a deep brown for dark', () => {
    expect(isDarkColor('#221d1a')).toBe(true)
  })

  it('takes a cream for light', () => {
    expect(isDarkColor('#f3ead0')).toBe(false)
  })

  it('reads three-digit colors', () => {
    expect(isDarkColor('#fff')).toBe(false)
  })
})

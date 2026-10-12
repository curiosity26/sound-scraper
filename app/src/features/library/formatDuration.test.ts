import { describe, expect, it } from 'vitest'

import { formatDuration } from './formatDuration'

describe('a duration shown to the user', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatDuration(65_000)).toBe('1:05')
  })

  it('rounds to the nearest second', () => {
    expect(formatDuration(65_400)).toBe('1:05')
  })

  it('shows hours, minutes and seconds from an hour on', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  it('shows nothing recorded as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
})

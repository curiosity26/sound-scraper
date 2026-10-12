import { describe, expect, it } from 'vitest'

import { formatSize } from './formatSize'

describe('a file size shown to the user', () => {
  it('shows megabytes to one decimal place', () => {
    expect(formatSize(2_500_000)).toBe('2.4 MB')
  })

  it('shows kilobytes under a megabyte', () => {
    expect(formatSize(512_000)).toBe('500 KB')
  })

  it('shows a tiny file as 1 KB', () => {
    expect(formatSize(300)).toBe('1 KB')
  })
})

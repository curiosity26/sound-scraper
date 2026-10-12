import { describe, expect, it } from 'vitest'

import { isFolderSkin } from './isFolderSkin'

describe('telling a skin folder from an installed skin', () => {
  it('takes an absolute macOS or Linux path for a folder', () => {
    expect(isFolderSkin('/Users/me/Skins/Mine')).toBe(true)
  })

  it('takes a Windows drive path for a folder', () => {
    expect(isFolderSkin('C:\\Skins\\Mine')).toBe(true)
  })

  it("takes an installed skin's id for no folder", () => {
    expect(isFolderSkin('com.example.skin')).toBe(false)
  })

  it('takes no skin (Default) for no folder', () => {
    expect(isFolderSkin(null)).toBe(false)
  })
})

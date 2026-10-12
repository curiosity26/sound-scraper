import { describe, expect, it } from 'vitest'

import { buttonState } from './buttonState'

// Only the state names matter here, not their cells.
const cells = (...names: string[]) =>
  Object.fromEntries(
    names.map(name => [name, [0, 0] satisfies [number, number]]),
  )

const at = { pressed: false, active: false, disabled: false }

describe("a skin button's look", () => {
  describe('given a sprite with every state', () => {
    const all = cells(
      'normal',
      'pressed',
      'active',
      'activePressed',
      'disabled',
    )

    it('is normal at rest', () => {
      expect(buttonState(all, at)).toBe('normal')
    })

    it('is activePressed when an active button is pressed', () => {
      expect(buttonState(all, { ...at, pressed: true, active: true })).toBe(
        'activePressed',
      )
    })
  })

  describe('given a sprite with only normal and pressed', () => {
    const plain = cells('normal', 'pressed')

    it('falls back to pressed when an active button is pressed', () => {
      expect(buttonState(plain, { ...at, pressed: true, active: true })).toBe(
        'pressed',
      )
    })
  })

  describe('given a sprite with only normal', () => {
    const normal = cells('normal')

    it('stays normal when active', () => {
      expect(buttonState(normal, { ...at, active: true })).toBe('normal')
    })

    it('stays normal when disabled', () => {
      expect(buttonState(normal, { ...at, disabled: true })).toBe('normal')
    })
  })

  describe('given a sprite with a mode of its own', () => {
    const record = cells('normal', 'pressed', 'recording')

    it("shows the mode's look in that mode", () => {
      expect(buttonState(record, { ...at, mode: 'recording' })).toBe(
        'recording',
      )
    })

    it('falls back to pressed when pressed in that mode', () => {
      expect(
        buttonState(record, { ...at, mode: 'recording', pressed: true }),
      ).toBe('pressed')
    })

    it('falls back to normal in a mode it has no look for', () => {
      expect(buttonState(record, { ...at, mode: 'paused' })).toBe('normal')
    })
  })

  describe('given a sprite with a mode and a disabled look', () => {
    const record = cells('normal', 'pressed', 'recording', 'disabled')

    it("keeps the mode's look while disabled in that mode", () => {
      expect(
        buttonState(record, { ...at, mode: 'recording', disabled: true }),
      ).toBe('recording')
    })

    it('looks disabled when disabled in a mode it has no look for', () => {
      expect(
        buttonState(record, { ...at, mode: 'paused', disabled: true }),
      ).toBe('disabled')
    })
  })
})

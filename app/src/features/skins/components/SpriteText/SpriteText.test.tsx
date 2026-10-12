import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedFont } from '@/bridge/generated'
import { imagesIn } from '@test/fixtures/imagesIn'
import { sheet } from '@test/fixtures/sheet'

import { SpriteText } from './SpriteText'

// 5 × 8 cells, 20 to a row.
const lcd: ResolvedFont = {
  image: sheet,
  glyphs: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.?',
  cell: [5, 8],
  columns: 20,
}

/** The field's characters, read back from the font cells drawn. */
const shown = () =>
  imagesIn(screen.container)
    .map(image => StyleSheet.flatten<ViewStyle>([image.props.style]))
    .map(({ left = 0, top = 0 }) =>
      Array.from(lcd.glyphs).at(
        (-Number(top) / 8) * lcd.columns - Number(left) / 5,
      ),
    )
    .join('')

describe('sprite text', () => {
  describe('given text the font has', () => {
    it('draws its characters', async () => {
      await render(<SpriteText font={lcd} text="AB" width={20} />)
      expect(shown()).toBe('AB')
    })

    it('is named by its text', async () => {
      await render(<SpriteText font={lcd} text="AB" width={20} />)
      expect(screen.getByLabelText('AB')).toBeOnTheScreen()
    })
  })

  describe('given accents, lowercase and characters the font lacks', () => {
    it('drops the accents, uppercases and draws ? for the rest', async () => {
      await render(<SpriteText font={lcd} text="Café ♪" width={30} />)
      expect(shown()).toBe('CAFE ?')
    })
  })

  describe('given right alignment', () => {
    it('fills the field from the right', async () => {
      await render(<SpriteText font={lcd} text="AB" width={20} align="right" />)
      expect(shown()).toBe('  AB')
    })
  })

  describe('given padding', () => {
    it("draws the font's blank cells across the rest of the field", async () => {
      await render(<SpriteText font={lcd} text="AB" width={20} pad />)
      expect(shown()).toBe('AB  ')
    })
  })

  describe('given text too long for the field', () => {
    beforeEach(async () => {
      vi.useFakeTimers()
      await render(<SpriteText font={lcd} text="ABC" width={10} />)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows what fits', () => {
      expect(shown()).toBe('AB')
    })

    describe('when a moment passes', () => {
      it('scrolls on by a character', async () => {
        await act(() => {
          vi.advanceTimersByTime(280)
        })
        expect(shown()).toBe('BC')
      })
    })
  })
})

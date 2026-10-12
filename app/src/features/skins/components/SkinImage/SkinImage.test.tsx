import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { PixelRatio } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SkinScale } from '@/features/skins/SkinScale'
import { imagesIn } from '@test/fixtures/imagesIn'
import { sheet } from '@test/fixtures/sheet'

import { SkinImage } from './SkinImage'

/** The one image drawn. */
const image = () => {
  const [drawn] = imagesIn(screen.container)
  if (!drawn) {
    throw new Error('No image')
  }
  return drawn
}

describe('a skin image', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('given a standard screen', () => {
    it('uses the 1x file', async () => {
      vi.spyOn(PixelRatio, 'get').mockReturnValue(1)
      await render(<SkinImage image={sheet} />)
      expect(image()).toHaveProp('source', [
        expect.objectContaining({ uri: 'file:///skins/x/sheet.png', scale: 1 }),
      ])
    })
  })

  describe('given a Retina screen', () => {
    it('uses the @2x file', async () => {
      vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
      await render(<SkinImage image={sheet} />)
      expect(image()).toHaveProp('source', [
        {
          uri: 'file:///skins/x/sheet@2x.png',
          width: 100,
          height: 40,
          scale: 2,
        },
      ])
    })

    it('draws at its size in points', async () => {
      vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
      await render(<SkinImage image={sheet} />)
      expect(image()).toHaveStyle({ width: 100, height: 40 })
    })

    describe('given double size', () => {
      const renderDoubled = (ref: typeof sheet) =>
        render(
          <SkinScale.Provider value={2}>
            <SkinImage image={ref} />
          </SkinScale.Provider>,
        )

      it('uses the @4x file', async () => {
        vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
        await renderDoubled(sheet)
        expect(image()).toHaveProp('source', [
          expect.objectContaining({
            uri: 'file:///skins/x/sheet@4x.png',
            scale: 4,
          }),
        ])
      })

      it('falls back to the @2x file when there is no @4x', async () => {
        vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
        await renderDoubled({ ...sheet, path4x: null })
        expect(image()).toHaveProp('source', [
          expect.objectContaining({
            uri: 'file:///skins/x/sheet@2x.png',
            scale: 2,
          }),
        ])
      })

      it('draws at twice its size', async () => {
        vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
        await renderDoubled(sheet)
        expect(image()).toHaveStyle({ width: 200, height: 80 })
      })
    })
  })

  describe('given a path with spaces and #', () => {
    it('escapes them in the file URL', async () => {
      vi.spyOn(PixelRatio, 'get').mockReturnValue(2)
      await render(
        <SkinImage image={{ ...sheet, path: '/a b/#1.png', path2x: null }} />,
      )
      expect(image()).toHaveProp('source', [
        expect.objectContaining({ uri: 'file:///a%20b/%231.png' }),
      ])
    })
  })
})

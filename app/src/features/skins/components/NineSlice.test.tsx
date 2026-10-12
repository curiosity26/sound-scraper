import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import { describe, expect, it } from 'vitest'

import { SkinScale } from '@/features/skins/SkinScale'
import { imagesIn } from '@test/fixtures/imagesIn'
import { sheet } from '@test/fixtures/sheet'

import { NineSlice } from './NineSlice'

/** Where each piece is drawn: the boxes around the images. */
const pieces = () => imagesIn(screen.container).map(image => image.parent)

describe('a nine-slice frame', () => {
  describe('given insets on every side', () => {
    const renderFrame = () =>
      render(
        <NineSlice image={sheet} slice={[4, 4, 4, 4]} width={300} height={200}>
          <Text>Inside</Text>
        </NineSlice>,
      )

    it('draws nine pieces', async () => {
      await renderFrame()
      expect(pieces()).toHaveLength(9)
    })

    it('keeps the corners their size', async () => {
      await renderFrame()
      expect(pieces()[0]).toHaveStyle({ left: 0, top: 0, width: 4, height: 4 })
    })

    it('stretches the center to fill the rest', async () => {
      await renderFrame()
      expect(pieces()[4]).toHaveStyle({
        left: 4,
        top: 4,
        width: 292,
        height: 192,
      })
    })

    it('lays its content inside the insets', async () => {
      await renderFrame()
      expect(screen.getByText('Inside').parent).toHaveStyle({
        left: 4,
        top: 4,
        right: 4,
        bottom: 4,
      })
    })
  })

  describe('given no insets', () => {
    it('draws one stretched piece', async () => {
      await render(
        <NineSlice
          image={sheet}
          slice={[0, 0, 0, 0]}
          width={300}
          height={200}
        />,
      )
      expect(pieces()).toHaveLength(1)
    })
  })

  describe('given double size', () => {
    it('doubles the corners', async () => {
      await render(
        <SkinScale.Provider value={2}>
          <NineSlice
            image={sheet}
            slice={[4, 4, 4, 4]}
            width={300}
            height={200}
          />
        </SkinScale.Provider>,
      )
      expect(pieces()[0]).toHaveStyle({ width: 8, height: 8 })
    })
  })
})

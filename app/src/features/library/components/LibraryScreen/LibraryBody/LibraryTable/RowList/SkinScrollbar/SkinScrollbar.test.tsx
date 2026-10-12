import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { sheet } from '@test/fixtures/sheet'

import { SkinScrollbar } from './SkinScrollbar'

/** A skin's scroll bar: a 10-point track and a thumb 10 points tall. */
const scrollbar = {
  image: sheet,
  track: [0, 0, 10, 40] satisfies [number, number, number, number],
  thumb: [10, 0, 10, 10] satisfies [number, number, number, number],
  thumbSlice: null,
}

/** A 100-point list holding `content` points, scrolled to `offset`. */
const renderScrollbar = (content: number, offset = 0) =>
  render(
    <SkinScrollbar
      scrollbar={scrollbar}
      viewport={100}
      content={content}
      offset={offset}
      onScrollTo={vi.fn()}
    />,
  )

/** The thumb: drawn over the track, inside the scroll bar. */
const thumb = () => {
  const [layer] = screen.getByRole('scrollbar').children
  const [, drawn] =
    layer === undefined || typeof layer === 'string' ? [] : layer.children
  if (drawn === undefined || typeof drawn === 'string') {
    throw new Error('No thumb')
  }
  return drawn
}

describe('the skin’s scroll bar', () => {
  describe('given everything fits in the list', () => {
    it('is hidden', async () => {
      await renderScrollbar(50)
      expect(screen.queryByRole('scrollbar')).not.toBeOnTheScreen()
    })
  })

  describe('given four times as much as the list shows', () => {
    it('shows', async () => {
      await renderScrollbar(400)
      expect(screen.getByRole('scrollbar')).toBeOnTheScreen()
    })

    it('has a thumb a quarter of the track long', async () => {
      await renderScrollbar(400)
      expect(thumb()).toHaveStyle({ height: 25 })
    })

    it('puts the thumb at the top before scrolling', async () => {
      await renderScrollbar(400)
      expect(thumb()).toHaveStyle({ top: 0 })
    })

    it('puts the thumb at the bottom when scrolled to the end', async () => {
      await renderScrollbar(400, 300)
      expect(thumb()).toHaveStyle({ top: 75 })
    })
  })

  describe('given far more than the list shows', () => {
    it('keeps the thumb long enough to grab', async () => {
      await renderScrollbar(100_000)
      expect(thumb()).toHaveStyle({ height: 6 })
    })
  })
})

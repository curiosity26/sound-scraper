import { render, screen } from '@testing-library/react-native'
import React, { type FC } from 'react'
import { StyleSheet, Text } from 'react-native'
import { describe, expect, it } from 'vitest'

import { PanelThemeProvider } from '@/shared/theme/PanelThemeProvider'
import type { PanelTheme } from '@/shared/theme/types'

import { usePanelStyles } from './usePanelStyles'

const styles = StyleSheet.create({ link: { color: '#0000ff', fontSize: 13 } })

/** A link and a table cell, styled their own way plus the panel's. */
const Content: FC = () => {
  const t = usePanelStyles()
  return (
    <>
      <Text style={[styles.link, t.link]}>A link</Text>
      <Text style={[styles.link, t.tableText, t.cell]}>A cell</Text>
    </>
  )
}

const theme: PanelTheme = {
  text: '#eeeeee',
  accent: '#00ff00',
  table: { text: '#cccccc' },
  scrollbar: null,
}

describe('panel styles', () => {
  describe('given no panel theme (the plain UI)', () => {
    it('leaves the content its own colors', async () => {
      await render(<Content />)
      expect(screen.getByText('A link')).toHaveStyle({ color: '#0000ff' })
    })
  })

  describe('given a panel theme', () => {
    it("colors links with the theme's accent", async () => {
      await render(
        <PanelThemeProvider value={theme}>
          <Content />
        </PanelThemeProvider>,
      )
      expect(screen.getByText('A link')).toHaveStyle({ color: '#00ff00' })
    })

    it("colors table text with the table's text color", async () => {
      await render(
        <PanelThemeProvider value={theme}>
          <Content />
        </PanelThemeProvider>,
      )
      expect(screen.getByText('A cell')).toHaveStyle({ color: '#cccccc' })
    })
  })

  describe('given a compact panel theme (a 1x panel)', () => {
    it('makes table cells smaller', async () => {
      await render(
        <PanelThemeProvider value={{ ...theme, compact: true }}>
          <Content />
        </PanelThemeProvider>,
      )
      expect(screen.getByText('A cell')).toHaveStyle({ fontSize: 11 })
    })
  })
})

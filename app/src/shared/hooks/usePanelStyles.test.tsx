import { renderHook } from '@testing-library/react-native'
import React, { type FC, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { PanelThemeProvider } from '@/shared/theme/PanelThemeProvider'
import type { PanelTheme } from '@/shared/theme/types'

import { usePanelStyles } from './usePanelStyles'

const theme: PanelTheme = {
  text: '#eeeeee',
  accent: '#00ff00',
  table: { text: '#cccccc' },
  scrollbar: null,
}

/** Renders the hook inside a panel themed with `panelTheme`. */
const renderInPanel = (panelTheme: PanelTheme) => {
  const Panel: FC<{ readonly children: ReactNode }> = props => (
    <PanelThemeProvider value={panelTheme}>{props.children}</PanelThemeProvider>
  )
  return renderHook(() => usePanelStyles(), { wrapper: Panel })
}

describe('panel styles', () => {
  describe('given no panel theme (the plain UI)', () => {
    it('adds nothing to the content’s own styles', async () => {
      const { result } = await renderHook(() => usePanelStyles())
      expect(result.current.link).toEqual({})
      expect(result.current.cell).toEqual({})
    })
  })

  describe('given a panel theme', () => {
    it("colors links with the theme's accent", async () => {
      const { result } = await renderInPanel(theme)
      expect(result.current.link).toMatchObject({ color: '#00ff00' })
    })

    it("colors table text with the table's text color", async () => {
      const { result } = await renderInPanel(theme)
      expect(result.current.tableText).toMatchObject({ color: '#cccccc' })
    })
  })

  describe('given a compact panel theme (a 1x panel)', () => {
    it('makes table cells smaller', async () => {
      const { result } = await renderInPanel({ ...theme, compact: true })
      expect(result.current.cell).toMatchObject({ fontSize: 11 })
    })
  })
})

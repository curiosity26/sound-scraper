import { renderHook } from '@testing-library/react-native'
import React, { type FC, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { SkinContext } from '@/features/skins/SkinContext'
import { testSkin } from '@test/fixtures/testSkin'

import { usePanelText } from './usePanelText'

/** Renders the hook for the library, in a skin whose library has `background`. */
const renderWithBackground = (background: string) => {
  const skin = testSkin()
  skin.panels.library = {
    ...skin.panels.library,
    controls: { ...skin.panels.library.controls, background },
  }
  const Skin: FC<{ readonly children: ReactNode }> = props => (
    <SkinContext.Provider value={skin}>{props.children}</SkinContext.Provider>
  )
  return renderHook(() => usePanelText('library'), { wrapper: Skin })
}

describe('telling a dark panel from a light one', () => {
  it('takes a deep brown for dark', async () => {
    const { result } = await renderWithBackground('#221d1a')
    expect(result.current.isDark).toBe(true)
  })

  it('takes a cream for light', async () => {
    const { result } = await renderWithBackground('#f3ead0')
    expect(result.current.isDark).toBe(false)
  })

  it('reads three-digit colors', async () => {
    const { result } = await renderWithBackground('#fff')
    expect(result.current.isDark).toBe(false)
  })
})

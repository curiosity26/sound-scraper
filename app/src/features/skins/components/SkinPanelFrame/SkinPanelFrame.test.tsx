import {
  fireEvent,
  render,
  renderHook,
  screen,
  userEvent,
} from '@testing-library/react-native'
import React, { type FC, type ReactNode } from 'react'
import { Text } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { skinStore } from '@/features/skins/skinStore'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { holdDown } from '@test/fixtures/holdDown'
import { imagesIn } from '@test/fixtures/imagesIn'
import { sheet } from '@test/fixtures/sheet'
import { testSkin } from '@test/fixtures/testSkin'

import { SkinPanelFrame } from './SkinPanelFrame'

vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

/** The test skin with a framed library: a 20-point title bar and a close button. */
const framedSkin = () => {
  const skin = testSkin()
  skin.panels.library = {
    ...skin.panels.library,
    minSize: [300, 200],
    frame: { image: sheet, slice: [20, 4, 4, 4] },
    close: {
      offset: [6, 4],
      size: [10, 8],
      sprite: { image: sheet, states: { normal: [0, 0], pressed: [20, 0] } },
    },
    controls: { text: '#eeeeee', accent: '#00ff00', background: '#111111' },
  }
  return skin
}

/** The skinned library frame, around whatever it shows. */
const LibraryFrame: FC<{ readonly children: ReactNode }> = props => (
  <SkinProvider>
    <SkinPanelFrame panel="library" title="Library">
      {props.children}
    </SkinPanelFrame>
  </SkinProvider>
)

describe('a skinned panel frame', () => {
  beforeEach(async () => {
    fakeSkins.reset()
    skinStore.set(framedSkin())
    await render(
      <LibraryFrame>
        <Text>Recordings</Text>
      </LibraryFrame>,
    )
  })

  describe('when its window is laid out at 400 × 300', () => {
    beforeEach(async () => {
      // The window's root view: it has no role or text of its own.
      await fireEvent(screen.getByTestId('library-frame'), 'layout', {
        nativeEvent: { layout: { width: 400, height: 300 } },
      })
    })

    it('gives the window its title bar, close button, grip and minimum size', () => {
      expect(fakeSkins.layoutOf('library')).toEqual({
        width: 0,
        height: 0,
        dragRegions: [0, 0, 400, 20],
        holes: [384, 4, 10, 8],
        grip: [386, 286, 14, 14],
        minWidth: 300,
        minHeight: 200,
        scale: 1,
      })
    })

    it('shows the close button in its normal look', () => {
      const [image] = imagesIn(
        screen.getByRole('button', { name: 'Close Library' }),
      )
      // The sprite's "normal" cell, at [0, 0].
      expect(image).toHaveStyle({ left: -0, top: -0 })
    })

    describe('when Close is held down', () => {
      it('shows its pressed look', async () => {
        const close = screen.getByRole('button', { name: 'Close Library' })
        await holdDown(close)
        const [image] = imagesIn(close)
        // The sprite's "pressed" cell, at [20, 0].
        expect(image).toHaveStyle({ left: -20, top: -0 })
      })
    })

    describe('when Close is pressed', () => {
      it('hides the panel', async () => {
        fakeSkins.setVisible('library', true)
        await userEvent
          .setup()
          .press(screen.getByRole('button', { name: 'Close Library' }))
        expect(fakeSkins.isVisible('library')).toBe(false)
      })
    })
  })
})

describe("a skinned panel frame's content", () => {
  beforeEach(() => {
    fakeSkins.reset()
    skinStore.set(framedSkin())
  })

  it("styles links with the panel's accent", async () => {
    const { result } = await renderHook(() => usePanelStyles(), {
      wrapper: LibraryFrame,
    })
    expect(result.current.link).toMatchObject({ color: '#00ff00' })
  })
})

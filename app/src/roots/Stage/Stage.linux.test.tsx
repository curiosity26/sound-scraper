import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
} from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, TurboModuleRegistry, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedSkin } from '@/bridge/generated'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { fakeStage } from '@test/fakes/NativeStage'
import { sheet } from '@test/fixtures/sheet'
import { skinElement } from '@test/fixtures/skinElement'
import { testSkin } from '@test/fixtures/testSkin'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))
vi.mock('@/bridge/NativeEditor', () => import('@test/fakes/NativeEditor'))

// The stage keeps its panels in its module (and the skin is in one too), so
// each test loads them afresh. The faked native modules load first, once,
// so the app and the test share the fakes imported above.
const loadApp = async () => {
  await Promise.all([
    import('@/bridge/NativeSoundScraper'),
    import('@/bridge/NativeSkins'),
    import('@/bridge/NativeEditor'),
  ])
  vi.resetModules()
  const [root, store] = await Promise.all([
    import('./Stage'),
    import('@/features/skins/skinStore'),
  ])
  fakeCore.reset()
  fakeSkins.reset()
  fakeStage.reset()
  return { Stage: root.Stage, skinStore: store.skinStore }
}

type App = Awaited<ReturnType<typeof loadApp>>
type HostElement = ReturnType<typeof screen.getByRole>

/**
 * The test skin with a Library button on the main panel, and a library
 * with a close button (a 20-point title bar).
 */
const stageSkin = (): ResolvedSkin => {
  const skin = testSkin()
  skin.panels.main.elements.toggleLibrary = skinElement([60, 30, 20, 10])
  skin.panels.library = {
    ...skin.panels.library,
    frame: { image: sheet, slice: [20, 4, 4, 4] },
    close: {
      offset: [6, 4],
      size: [10, 8],
      sprite: { image: sheet, states: { normal: [0, 0], pressed: [20, 0] } },
    },
  }
  return skin
}

/** The stage with the skin loaded (or, with null, failing to load). */
const showStage = async (app: App, skin: ResolvedSkin | null = stageSkin()) => {
  const { Stage } = app
  if (skin) {
    app.skinStore.set(skin)
  }
  await render(<Stage />)
}

/** The stage window covers the monitor's work area, which is this size. */
const layOutStage = async (width: number, height: number) => {
  const root = screen.root
  if (!root) {
    throw new Error('Nothing rendered')
  }
  await fireEvent(root, 'layout', {
    nativeEvent: { layout: { width, height } },
  })
}

/** A panel on the stage, shown or not. */
const panel = (name: string) =>
  screen.getByLabelText(`${name} panel`, { includeHiddenElements: true })

/** Where a panel is on the stage. */
const frameOf = (name: string) => {
  const style = StyleSheet.flatten<ViewStyle>([panel(name).props.style])
  return {
    x: style.left,
    y: style.top,
    w: style.width,
    h: style.height,
  }
}

const zOf = (name: string) =>
  StyleSheet.flatten<ViewStyle>([panel(name).props.style]).zIndex ?? 0

/** The library's window gets its size, as the stage lays it out. */
const layOutLibrary = async () => {
  const { w, h } = frameOf('Library')
  // The panel's root view: it has no role or text of its own.
  await fireEvent(screen.getByTestId('library-frame'), 'layout', {
    nativeEvent: { layout: { width: w, height: h } },
  })
}

/** The view the main panel's drag region (its whole area here) covers. */
const dragRegion = (): HostElement => {
  const [area] = panel('Main').queryAll(node => {
    const style = StyleSheet.flatten<ViewStyle>([node.props.style])
    return (
      node.children.length === 0 &&
      style.position === 'absolute' &&
      style.left === 0 &&
      style.top === 0 &&
      style.width === 200 &&
      style.height === 60
    )
  })
  if (!area) {
    throw new Error('No drag region')
  }
  return area
}

/** The native side reports a gesture's new frames. */
const gestureMoves = (
  frames: { id: string; x: number; y: number; w: number; h: number }[],
) =>
  act(() => {
    fakeStage.emit({ frames: JSON.stringify(frames) })
  })

const gestureEnds = () =>
  act(() => {
    fakeStage.emit({ end: true })
  })

describe('the stage', () => {
  let app: App
  const user = userEvent.setup()

  beforeEach(async () => {
    app = await loadApp()
    vi.spyOn(TurboModuleRegistry, 'get').mockImplementation(name =>
      name === 'SoundScraperStage' ? fakeStage.module : null,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('given the main panel has no skin to show', () => {
    beforeEach(async () => {
      await showStage(app, null)
    })

    describe('when the stage is laid out', () => {
      beforeEach(async () => {
        await layOutStage(1600, 1000)
      })

      it('keeps the main panel out of sight', () => {
        expect(panel('Main')).not.toBeVisible()
      })

      it('takes no clicks', () => {
        expect(fakeStage.inputRegion()).toBeNull()
      })
    })
  })

  describe('given the main panel', () => {
    beforeEach(async () => {
      await showStage(app)
    })

    describe('when the stage has not been laid out', () => {
      it('keeps the main panel out of sight', () => {
        expect(panel('Main')).not.toBeVisible()
      })

      it('takes no clicks', () => {
        expect(fakeStage.inputRegion()).toBeNull()
      })
    })

    describe('when the stage is laid out at 1600 × 1000', () => {
      beforeEach(async () => {
        await layOutStage(1600, 1000)
      })

      it('shows the main panel', () => {
        expect(panel('Main')).toBeVisible()
      })

      it('centers the main panel a fifth of the way down', () => {
        expect(frameOf('Main')).toEqual({ x: 700, y: 200, w: 200, h: 60 })
      })

      it('takes clicks only on the main panel', () => {
        expect(fakeStage.inputRegion()).toEqual([700, 200, 200, 60])
      })

      describe('when the source is pressed', () => {
        it('opens the source menu under it, where the main panel is', async () => {
          await user.press(screen.getByRole('button', { name: /^Source/ }))
          expect(fakeSkins.native.showMenu).toHaveBeenCalledWith(
            'main',
            expect.any(Array),
            0,
            704,
            256,
          )
        })
      })

      describe('when Library is pressed', () => {
        beforeEach(async () => {
          await user.press(screen.getByRole('button', { name: 'Library' }))
        })

        it('shows the Library button on', () => {
          expect(screen.getByRole('button', { name: 'Library' })).toBeSelected()
        })

        it('shows the library', () => {
          expect(panel('Library')).toBeVisible()
        })

        it('docks the library below the main panel', () => {
          expect(frameOf('Library')).toEqual({
            x: 700,
            y: 260,
            w: 840,
            h: 420,
          })
        })

        it('brings the library to the front', () => {
          expect(zOf('Library')).toBeGreaterThan(zOf('Main'))
        })

        it('takes clicks on both panels', () => {
          expect(fakeStage.inputRegion()).toEqual([
            700, 200, 200, 60, 700, 260, 840, 420,
          ])
        })

        it('saves the layout with the library open', () => {
          expect(fakeStage.savedLayout()?.panels).toContainEqual({
            id: 'library',
            x: 700,
            y: 260,
            w: 840,
            h: 420,
            visible: true,
          })
        })

        describe('when Close is pressed on the library', () => {
          beforeEach(async () => {
            await layOutLibrary()
            await user.press(
              screen.getByRole('button', { name: /^Close Library/ }),
            )
          })

          it('hides the library', () => {
            expect(panel('Library')).not.toBeVisible()
          })

          it('shows the Library button off', () => {
            expect(
              screen.getByRole('button', { name: 'Library' }),
            ).not.toBeSelected()
          })

          it('takes clicks only on the main panel again', () => {
            expect(fakeStage.inputRegion()).toEqual([700, 200, 200, 60])
          })
        })

        describe('when the library was moved, closed and opened again', () => {
          it('opens it where it was', async () => {
            await gestureMoves([
              { id: 'library', x: 100, y: 80, w: 840, h: 420 },
            ])
            await gestureEnds()
            await layOutLibrary()
            await user.press(
              screen.getByRole('button', { name: /^Close Library/ }),
            )
            await user.press(screen.getByRole('button', { name: 'Library' }))
            expect(frameOf('Library')).toEqual({
              x: 100,
              y: 80,
              w: 840,
              h: 420,
            })
          })
        })

        describe('when the main panel is pressed in its drag region', () => {
          beforeEach(async () => {
            await user.press(dragRegion())
          })

          it('hands the move to the native side', () => {
            expect(fakeStage.gestures()).toEqual([
              { panel: 'main', kind: 'move', minWidth: 0, minHeight: 0 },
            ])
          })

          describe('when the move reports new frames', () => {
            beforeEach(async () => {
              await gestureMoves([
                { id: 'main', x: 10, y: 20, w: 200, h: 60 },
                { id: 'library', x: 10, y: 80, w: 840, h: 420 },
              ])
            })

            it('moves the main panel there', () => {
              expect(frameOf('Main')).toEqual({ x: 10, y: 20, w: 200, h: 60 })
            })

            it('moves the library with it', () => {
              expect(frameOf('Library')).toEqual({
                x: 10,
                y: 80,
                w: 840,
                h: 420,
              })
            })

            it('takes clicks where the panels are now', () => {
              expect(fakeStage.inputRegion()).toEqual([
                10, 20, 200, 60, 10, 80, 840, 420,
              ])
            })

            describe('when the move ends', () => {
              it('saves the layout where the panels are now', async () => {
                await gestureEnds()
                expect(fakeStage.savedLayout()?.panels).toEqual([
                  { id: 'main', x: 10, y: 20, w: 200, h: 60, visible: true },
                  {
                    id: 'library',
                    x: 10,
                    y: 80,
                    w: 840,
                    h: 420,
                    visible: true,
                  },
                ])
              })
            })
          })
        })
      })
    })
  })

  describe('given a library with a larger minimum size than it opens at', () => {
    beforeEach(async () => {
      const skin = stageSkin()
      skin.panels.library = { ...skin.panels.library, minSize: [900, 300] }
      await showStage(app, skin)
      await layOutStage(1600, 1000)
    })

    describe('when the library opens', () => {
      it('grows it to that size', async () => {
        await user.press(screen.getByRole('button', { name: 'Library' }))
        await layOutLibrary()
        expect(frameOf('Library')).toEqual({ x: 700, y: 260, w: 900, h: 420 })
      })
    })
  })

  describe('given a layout saved with the library open', () => {
    beforeEach(async () => {
      fakeStage.setSavedLayout({
        panels: [
          { id: 'main', x: 50, y: 60, w: 200, h: 60, visible: true },
          { id: 'library', x: 50, y: 120, w: 700, h: 300, visible: true },
        ],
        scale: 1,
      })
      await showStage(app)
      await layOutStage(1600, 1000)
    })

    it('puts the main panel back where it was', () => {
      expect(frameOf('Main')).toEqual({ x: 50, y: 60, w: 200, h: 60 })
    })

    it('reopens the library where it was', () => {
      expect(frameOf('Library')).toEqual({ x: 50, y: 120, w: 700, h: 300 })
    })

    it('shows the Library button on', () => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeSelected()
    })
  })
})

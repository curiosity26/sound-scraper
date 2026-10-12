import { act, render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedAnimation, ResolvedSkin } from '@/bridge/generated'
import { isArrayOf, isNumber, isShape, isString } from '@/shared/utils/guards'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore, recording } from '@test/fakes/NativeSoundScraper'
import { imagesIn } from '@test/fixtures/imagesIn'
import { sheet } from '@test/fixtures/sheet'
import { skinElement } from '@test/fixtures/skinElement'
import { testSkin } from '@test/fixtures/testSkin'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

// The app keeps state in its modules (the playback store's subscription to
// the player, the skin and double-size stores), so each test loads them
// afresh. The faked native modules load first, once, so the app and the
// test share the fakes imported above.
const loadApp = async () => {
  await Promise.all([
    import('@/bridge/NativeSoundScraper'),
    import('@/bridge/NativeSkins'),
  ])
  vi.resetModules()
  const [panel, skinned, store, playbackModule] = await Promise.all([
    import('./MainPanel'),
    import('@/features/skins/components/Skinned'),
    import('@/features/skins/skinStore'),
    import('@/features/playback/playback'),
  ])
  fakeCore.reset()
  fakeSkins.reset()
  return {
    MainPanel: panel.MainPanel,
    Skinned: skinned.Skinned,
    skinStore: store.skinStore,
    playback: playbackModule.playback,
  }
}

type App = Awaited<ReturnType<typeof loadApp>>
type HostElement = ReturnType<typeof screen.getByRole>

const showMainPanel = async (app: App, skin: ResolvedSkin = testSkin()) => {
  const { MainPanel, Skinned } = app
  app.skinStore.set(skin)
  await render(
    <Skinned>
      <MainPanel />
    </Skinned>,
  )
}

const press = (name: string) =>
  userEvent
    .setup({
      advanceTimers: ms => {
        vi.advanceTimersByTime(ms)
      },
    })
    .press(screen.getByRole('button', { name }))

/** Lets time pass (animations, marquees, eased needles). */
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

/** The test skin with a play button and a seek bar, for playback. */
const playbackSkin = (seekStyle: Record<string, number[]> = {}) => {
  const skin = testSkin()
  skin.panels.main.elements.play = skinElement([56, 30, 20, 10])
  skin.panels.main.elements.seek = skinElement([0, 20, 104, 6], {
    style: {
      track: '#333333',
      fill: '#00ff00',
      thumb: '#ffffff',
      ...seekStyle,
    },
  })
  return skin
}

/** Selects a one-minute recording, which loads it into the player. */
const loadRecording = async (app: App) => {
  const song = recording('Song.mp3', { durationMs: 60_000 })
  fakeCore.setRecordings([song])
  await act(() => app.playback.select(song))
}

/** An element's own style, flattened. */
const styleOf = (node: HostElement) =>
  StyleSheet.flatten<ViewStyle>([node.props.style])

const hasColor = isShape<{ backgroundColor: string }>({
  backgroundColor: isString,
})
const isRotated = isShape<{ transform: { rotate: string }[] }>({
  transform: isArrayOf(isShape<{ rotate: string }>({ rotate: isString })),
})
const isPlaced = isShape<{ left: number }>({ left: isNumber })

/** The plain boxes painted `color` inside `element`. */
const paintedIn = (element: HostElement, color: string) =>
  element.queryAll(node => {
    const style = styleOf(node)
    return hasColor(style) && style.backgroundColor === color
  })

/** The seek bar's piece painted `color` (track, fill or thumb). */
const seekPiece = (color: string) => {
  const [piece] = paintedIn(
    screen.getByRole('adjustable', { name: 'Position' }),
    color,
  )
  if (!piece) {
    throw new Error(`Nothing painted ${color}`)
  }
  return piece
}

describe('the main panel', () => {
  let app: App

  beforeEach(async () => {
    vi.useFakeTimers()
    app = await loadApp()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('given the test skin', () => {
    beforeEach(async () => {
      await showMainPanel(app)
    })

    it('gives the window its size, drag regions and click holes', () => {
      expect(fakeSkins.layoutOf('main')).toEqual({
        width: 200,
        height: 60,
        dragRegions: [0, 0, 200, 60],
        // Record, stop, source and the visualizer take clicks.
        holes: [4, 30, 20, 10, 30, 30, 20, 10, 4, 46, 100, 8, 120, 14, 60, 12],
        grip: [],
        minWidth: 200,
        minHeight: 60,
        scale: 1,
      })
    })

    it('shows the elapsed time', () => {
      expect(screen.getByLabelText('0:00.0')).toBeOnTheScreen()
    })

    it('leaves out the buttons the skin lacks', () => {
      expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    })

    it('shows the record button in its normal look', () => {
      const [image] = imagesIn(screen.getByRole('button', { name: 'Record' }))
      // The sprite's "normal" cell, at [0, 0].
      expect(image).toHaveStyle({ left: -0, top: -0 })
    })

    describe('when Record is pressed', () => {
      beforeEach(async () => {
        await press('Record')
      })

      it('starts recording all system audio', () => {
        expect(fakeCore.native.recorderStart).toHaveBeenCalledWith(0)
      })

      it('turns Record into Pause, as the skin has no pause button', () => {
        expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
      })
    })

    describe('when the recording has run a minute and five seconds', () => {
      beforeEach(async () => {
        await press('Record')
        await act(() => {
          fakeCore.emit({ kind: 'progress', elapsedMs: 65_432 })
        })
      })

      it('shows the elapsed time to the tenth of a second', () => {
        expect(screen.getByLabelText('1:05.4')).toBeOnTheScreen()
      })
    })
  })

  describe('given an elapsed display without tenths', () => {
    beforeEach(async () => {
      const skin = testSkin()
      skin.panels.main.elements.elapsed = skinElement([4, 4, 60, 8], {
        font: 'lcd',
        style: { tenths: false },
      })
      await showMainPanel(app, skin)
      await press('Record')
    })

    it('shows minutes and seconds like a clock', async () => {
      await act(() => {
        fakeCore.emit({ kind: 'progress', elapsedMs: 65_432 })
      })
      expect(screen.getByLabelText('01:05')).toBeOnTheScreen()
    })

    it('counts the minutes on past an hour', async () => {
      await act(() => {
        fakeCore.emit({ kind: 'progress', elapsedMs: 6_065_432 })
      })
      expect(screen.getByLabelText('101:05')).toBeOnTheScreen()
    })
  })

  describe('given double size is on', () => {
    beforeEach(async () => {
      fakeCore.setSettings({ doubleSize: true })
      await showMainPanel(app)
    })

    it('gives the window its doubled size, drag regions and click holes', () => {
      expect(fakeSkins.layoutOf('main')).toEqual({
        width: 400,
        height: 120,
        dragRegions: [0, 0, 400, 120],
        holes: [
          8, 60, 40, 20, 60, 60, 40, 20, 8, 92, 200, 16, 240, 28, 120, 24,
        ],
        grip: [],
        minWidth: 400,
        minHeight: 120,
        scale: 2,
      })
    })
  })

  describe('given a skin with playback controls', () => {
    describe('given nothing is loaded', () => {
      beforeEach(async () => {
        await showMainPanel(app, playbackSkin())
      })

      it('disables Play', () => {
        expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
      })
    })

    describe('when Record is pressed', () => {
      beforeEach(async () => {
        await showMainPanel(app, playbackSkin())
        await press('Record')
      })

      it('lights the record button', () => {
        const [image] = imagesIn(screen.getByRole('button', { name: 'Record' }))
        // The sprite's "recording" cell, at [40, 0].
        expect(image).toHaveStyle({ left: -40, top: -0 })
      })

      it('disables Record until the recording stops', () => {
        expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled()
      })
    })

    describe('given a recording is loaded', () => {
      beforeEach(async () => {
        await showMainPanel(app, playbackSkin())
        await loadRecording(app)
      })

      it('enables Play', () => {
        expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
      })

      it('puts the seek thumb at the start', () => {
        expect(seekPiece('#ffffff').parent).toHaveStyle({ left: 0 })
      })

      describe('when Play is pressed', () => {
        beforeEach(async () => {
          await press('Play')
        })

        it('plays the recording', () => {
          expect(fakeCore.native.playerPlay).toHaveBeenCalled()
        })

        it('turns Play into Pause', () => {
          expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
        })

        it('keeps Record enabled, to start a new recording', () => {
          expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled()
        })
      })

      describe('when playback reaches the middle', () => {
        beforeEach(async () => {
          await press('Play')
          await act(() => {
            fakeCore.emit({ kind: 'playerProgress', positionMs: 30_000 })
          })
        })

        it('gives the seek bar the position in seconds', () => {
          expect(
            screen.getByRole('adjustable', { name: 'Position' }),
          ).toHaveAccessibilityValue({ min: 0, max: 60, now: 30 })
        })

        it('shows the position as the elapsed time', () => {
          expect(screen.getByLabelText('0:30.0')).toBeOnTheScreen()
        })

        it('moves the seek thumb halfway along the bar', () => {
          // The thumb is 4 wide (half the bar's height), so it travels 100.
          expect(seekPiece('#ffffff').parent).toHaveStyle({ left: 50 })
        })

        it('fills the bar up to the middle of the thumb', () => {
          expect(seekPiece('#00ff00')).toHaveStyle({ width: 52 })
        })
      })

      describe('given it is playing', () => {
        beforeEach(async () => {
          await press('Play')
        })

        describe('when Pause is pressed', () => {
          it('pauses the player', async () => {
            await press('Pause')
            expect(fakeCore.native.playerPause).toHaveBeenCalled()
          })
        })

        describe('when Stop is pressed', () => {
          it('stops the player', async () => {
            await press('Stop')
            expect(fakeCore.native.playerStop).toHaveBeenCalled()
          })
        })
      })
    })

    describe('given a seek bar with its own thumb size', () => {
      beforeEach(async () => {
        await showMainPanel(app, playbackSkin({ thumbSize: [6, 12] }))
        await loadRecording(app)
      })

      it('draws the thumb that size, centered on the bar', () => {
        const thumb = seekPiece('#ffffff')
        expect(thumb).toHaveStyle({ width: 6, height: 12 })
        expect(thumb.parent).toHaveStyle({ top: -3 })
      })
    })
  })

  describe('the visualizer', () => {
    beforeEach(async () => {
      await showMainPanel(app)
    })

    it("names the skin's first look", () => {
      expect(
        screen.getByRole('button', { name: /^Visualizer: Bars\./ }),
      ).toBeOnTheScreen()
    })

    it("hands the native view the look, with the element's idle colors", () => {
      const [view] = screen.container.queryAll(
        node => node.type === 'SSVisualizerView',
      )
      expect(view).toHaveProp(
        'preset',
        JSON.stringify({ grid: '#111111', name: 'Bars', style: 'bars' }),
      )
    })

    describe('when it is pressed', () => {
      it('shows the next look', async () => {
        await press('Visualizer: Bars. Click for the next look.')
        expect(
          screen.getByRole('button', { name: /^Visualizer: Scope\./ }),
        ).toBeOnTheScreen()
      })
    })

    describe('when it is pressed past the last look', () => {
      it('starts over at the first', async () => {
        await press('Visualizer: Bars. Click for the next look.')
        await press('Visualizer: Scope. Click for the next look.')
        expect(
          screen.getByRole('button', { name: /^Visualizer: Bars\./ }),
        ).toBeOnTheScreen()
      })
    })
  })

  describe('given a needle meter', () => {
    // 0 VU is -16 dBFS; the scale runs -20 to +3 VU across 64°.
    const reference = 10 ** (-16 / 20)

    /** Where the needle points, in degrees from straight up. */
    const needleAngle = () => {
      // The meter has no text or state to find it by: its test ID.
      const [style] = screen
        .getByTestId('levels')
        .queryAll(node => isRotated(styleOf(node)))
        .map(styleOf)
        .filter(isRotated)
      return Number.parseFloat(style?.transform[0]?.rotate ?? '')
    }

    beforeEach(async () => {
      const skin = testSkin()
      skin.panels.main.elements.levels = skinElement([120, 4, 60, 8], {
        style: {
          kind: 'needle',
          faces: 1,
          sweep: 64,
          range: [-20, 3],
          reference: -16,
        },
      })
      await showMainPanel(app, skin)
      await press('Record')
    })

    it('rests the needle at the left end in silence', () => {
      expect(needleAngle()).toBe(-32)
    })

    describe('when the level reaches the reference level', () => {
      it('points the needle at 0 VU', async () => {
        await act(() => {
          fakeCore.emit({
            kind: 'progress',
            peak: reference,
            rms: reference,
          })
        })
        await wait(500)
        expect(needleAngle()).toBeCloseTo(-32 + (64 * 20) / 23, 5)
      })
    })

    describe('when the level goes past the top of the scale', () => {
      it('pins the needle at the right end', async () => {
        await act(() => {
          fakeCore.emit({ kind: 'progress', peak: 1, rms: 1 })
        })
        await wait(500)
        expect(needleAngle()).toBe(32)
      })
    })
  })

  describe('given a reel animation', () => {
    /** The playback skin with a three-frame, 10 fps reel. */
    const reelSkin = (
      play: ResolvedAnimation['play'],
      speed: ResolvedAnimation['speed'] = 'constant',
    ): ResolvedSkin => {
      const skin = playbackSkin()
      skin.panels.main.animations = [
        {
          name: 'reel',
          rect: [150, 30, 20, 10],
          sprite: {
            image: { ...sheet, path: '/skins/x/reel.png', path2x: null },
            states: { a: [0, 0], b: [20, 0], c: [40, 0] },
          },
          frames: ['a', 'b', 'c'],
          fps: 10,
          play,
          speed,
        },
      ]
      return skin
    }

    /** The reel frame showing (0, 1 or 2), from its image's offset. */
    const reelFrame = () => {
      const [left] = imagesIn(screen.container)
        .filter(image => JSON.stringify(image.props.source).includes('reel'))
        .map(styleOf)
        .filter(isPlaced)
        .map(style => style.left)
      return Math.abs(Math.round((left ?? Number.NaN) / 20))
    }

    /** Whether the reel moves on to another frame within 150 ms. */
    const reelTurns = async () => {
      const before = reelFrame()
      await wait(150)
      return reelFrame() !== before
    }

    const startRecording = () => press('Record')
    const pauseRecording = async () => {
      await press('Record')
      // Play pauses a recording.
      await press('Pause')
    }
    const playBack = async () => {
      await loadRecording(app)
      await press('Play')
    }

    describe('given it plays while recording', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('recording'))
      })

      it('stands still while nothing happens', async () => {
        expect(await reelTurns()).toBe(false)
      })

      it('turns while recording', async () => {
        await startRecording()
        expect(await reelTurns()).toBe(true)
      })

      it('stands still while the recording is paused', async () => {
        await pauseRecording()
        expect(await reelTurns()).toBe(false)
      })

      it('stands still while playing back', async () => {
        await playBack()
        expect(await reelTurns()).toBe(false)
      })
    })

    describe('given it plays while a recording is active', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('active'))
      })

      it('turns while the recording is paused', async () => {
        await pauseRecording()
        expect(await reelTurns()).toBe(true)
      })
    })

    describe('given it always plays', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('always'))
      })

      it('turns while nothing happens', async () => {
        expect(await reelTurns()).toBe(true)
      })
    })

    describe('given it plays while playing back', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('playing'))
      })

      it('turns while playing back', async () => {
        await playBack()
        expect(await reelTurns()).toBe(true)
      })

      it('stands still while recording', async () => {
        await startRecording()
        expect(await reelTurns()).toBe(false)
      })
    })

    describe('given it rolls with the tape', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('rolling'))
      })

      it('turns while recording', async () => {
        await startRecording()
        expect(await reelTurns()).toBe(true)
      })

      it('turns while playing back', async () => {
        await playBack()
        expect(await reelTurns()).toBe(true)
      })
    })

    describe('given its speed follows the level', () => {
      beforeEach(async () => {
        await showMainPanel(app, reelSkin('recording', 'level'))
        await startRecording()
      })

      it('turns slower than its frame rate in silence', async () => {
        // At 10 fps it would be on its second frame.
        await wait(150)
        expect(reelFrame()).toBe(0)
      })

      it('turns faster than its frame rate when loud', async () => {
        await act(() => {
          fakeCore.emit({ kind: 'progress', peak: 1, rms: 1 })
        })
        // At 10 fps it would still be on its first frame.
        await wait(66)
        expect(reelFrame()).toBe(1)
      })
    })
  })
})

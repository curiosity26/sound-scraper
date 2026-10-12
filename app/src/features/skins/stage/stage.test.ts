import { TurboModuleRegistry } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseNative } from '@/bridge/parseNative'
import type { SkinWindowEvent } from '@/features/skins/types'
import { isShape } from '@/shared/utils/guards'
import { fakeEmitter } from '@test/fakes/emitter'

import { isPlacements } from './guards/isPlacements'
import type { Spec, StageEvent } from './stageNative'
import type { Placement } from './types'

const isScene = isShape<{ panels: Placement[] }>({ panels: isPlacements })

/**
 * The stage's native side (Linux's StageModule), faked: panels open where
 * asked, resizes take effect, a saved layout is `saved`, and gestures
 * report what the test sends.
 */
const fakeStage = (saved = 'null') => {
  const events = fakeEmitter<StageEvent>('fake:stageEvent')
  events.clear()
  const native = {
    onStageEvent: vi.fn(events.on),
    load: vi.fn(() => saved),
    save: vi.fn((_json: string) => {}),
    place: vi.fn(
      (
        _scene: string,
        _id: string,
        x: number,
        y: number,
        w: number,
        h: number,
      ) => JSON.stringify({ x, y, w, h }),
    ),
    analyze: vi.fn((_scene: string) =>
      JSON.stringify({ docked: [], constrain: [], tidy: [] }),
    ),
    scale: vi.fn((_scene: string, _ratio: number) => '[]'),
    resize: vi.fn((scene: string, id: string, dw: number, dh: number) =>
      JSON.stringify(
        parseNative(scene, isScene, 'scene')
          .panels.filter(p => p.id === id)
          .map(p => ({ id, x: p.x, y: p.y, w: p.w + dw, h: p.h + dh })),
      ),
    ),
    beginGesture: vi.fn(
      (
        _scene: string,
        _id: string,
        _kind: string,
        _minWidth: number,
        _minHeight: number,
      ) => {},
    ),
    setInputRegion: vi.fn((_rects: number[]) => {}),
    moveToNextMonitor: vi.fn(() => {}),
  } satisfies Spec
  const module: Spec = native
  return { native, module, emit: events.emit }
}

type FakeStage = ReturnType<typeof fakeStage>

// The stage keeps its panels in its module, and looks its native module up
// once, so each test loads it afresh on a fresh fake.
const loadStage = async (fake: FakeStage) => {
  vi.resetModules()
  vi.spyOn(TurboModuleRegistry, 'get').mockImplementation(name =>
    name === 'SoundScraperStage' ? fake.module : null,
  )
  const { stage } = await import('./stage')
  return stage
}

type Stage = Awaited<ReturnType<typeof loadStage>>

/** A 1600 × 1000 stage with a 400 × 120 main panel. */
const startStage = (stage: Stage) => {
  stage.setSize(1600, 1000)
  stage.setMainLayout(400, 120, 1)
}

const frameOf = (stage: Stage, id: string) =>
  stage.getSnapshot().panels.find(p => p.id === id)?.frame

describe('the stage', () => {
  let fake: FakeStage
  let stage: Stage

  beforeEach(async () => {
    fake = fakeStage()
    stage = await loadStage(fake)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('given only its size', () => {
    it('waits for the main panel', () => {
      stage.setSize(1600, 1000)
      expect(stage.getSnapshot().started).toBe(false)
    })
  })

  describe('given only the main panel', () => {
    it('waits for its size', () => {
      stage.setMainLayout(400, 120, 1)
      expect(stage.getSnapshot().started).toBe(false)
    })
  })

  describe('given its size and the main panel', () => {
    beforeEach(() => {
      startStage(stage)
    })

    it('centers the main panel a fifth of the way down', () => {
      expect(frameOf(stage, 'main')).toEqual({ x: 600, y: 200, w: 400, h: 120 })
    })

    it('takes clicks only on the main panel', () => {
      expect(fake.native.setInputRegion).toHaveBeenLastCalledWith([
        600, 200, 400, 120,
      ])
    })

    describe('when the library opens', () => {
      let events: SkinWindowEvent[]

      beforeEach(() => {
        events = []
        const off = stage.onEvent(e => events.push(e))
        stage.setVisible('library', true)
        off()
      })

      it('says it was shown', () => {
        expect(events).toEqual([{ window: 'library', event: 'shown' }])
      })

      it('shows it', () => {
        expect(stage.isVisible('library')).toBe(true)
      })

      it('docks it below the main panel', () => {
        expect(frameOf(stage, 'library')).toEqual({
          x: 600,
          y: 320,
          w: 840,
          h: 420,
        })
      })

      it('brings it to the front', () => {
        expect(stage.getSnapshot().order.at(-1)).toBe('library')
      })

      it('takes clicks on both panels', () => {
        expect(fake.native.setInputRegion).toHaveBeenLastCalledWith([
          600, 200, 400, 120, 600, 320, 840, 420,
        ])
      })

      it('saves the layout', () => {
        expect(fake.native.save).toHaveBeenCalled()
      })

      it('gives its menus their place on the stage', () => {
        expect(stage.origin('library')).toEqual([600, 320])
      })
    })

    describe('when the library reports a larger minimum size', () => {
      it('grows it to that size', () => {
        stage.setVisible('library', true)
        stage.setPanelChrome('library', {
          minSize: [900, 300],
          resizable: true,
          scale: 1,
        })
        expect(frameOf(stage, 'library')).toEqual({
          x: 600,
          y: 320,
          w: 900,
          h: 420,
        })
      })
    })

    describe('when a move starts on the main panel', () => {
      beforeEach(() => {
        stage.setVisible('library', true)
        stage.beginGesture('main', 'move')
      })

      it('hands the move to the native side', () => {
        expect(fake.native.beginGesture).toHaveBeenCalledWith(
          expect.any(String),
          'main',
          'move',
          0,
          0,
        )
      })

      describe('when the move reports new frames', () => {
        beforeEach(() => {
          fake.emit({
            frames: JSON.stringify([
              { id: 'main', x: 10, y: 20, w: 400, h: 120 },
              { id: 'library', x: 10, y: 140, w: 840, h: 420 },
            ]),
          })
        })

        it('moves the panels there', () => {
          expect(frameOf(stage, 'library')).toEqual({
            x: 10,
            y: 140,
            w: 840,
            h: 420,
          })
        })

        describe('when the move ends', () => {
          it('saves the layout', () => {
            fake.native.save.mockClear()
            fake.emit({ end: true })
            expect(fake.native.save).toHaveBeenCalledTimes(1)
          })
        })
      })
    })

    describe('when the library is hidden', () => {
      beforeEach(() => {
        stage.setVisible('library', true)
        stage.setVisible('library', false)
      })

      it('hides it', () => {
        expect(stage.isVisible('library')).toBe(false)
      })

      it('takes clicks only on the main panel again', () => {
        expect(fake.native.setInputRegion).toHaveBeenLastCalledWith([
          600, 200, 400, 120,
        ])
      })

      describe('when it opens again', () => {
        it('opens where it was', () => {
          stage.setVisible('library', true)
          expect(frameOf(stage, 'library')).toEqual({
            x: 600,
            y: 320,
            w: 840,
            h: 420,
          })
        })
      })
    })
  })

  describe('given a saved layout', () => {
    beforeEach(async () => {
      fake = fakeStage(
        JSON.stringify({
          version: 1,
          panels: [
            { id: 'main', x: 50, y: 60, w: 400, h: 120, visible: true },
            { id: 'library', x: 50, y: 180, w: 700, h: 300, visible: true },
          ],
          scale: 1,
        }),
      )
      stage = await loadStage(fake)
      startStage(stage)
    })

    it('puts the main panel back where it was', () => {
      expect(frameOf(stage, 'main')).toEqual({ x: 50, y: 60, w: 400, h: 120 })
    })

    it('reopens the library where it was', () => {
      expect(frameOf(stage, 'library')).toEqual({
        x: 50,
        y: 180,
        w: 700,
        h: 300,
      })
    })
  })
})

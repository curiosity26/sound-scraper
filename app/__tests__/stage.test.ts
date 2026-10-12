/**
 * @format
 */

import { describe, expect, it, vi } from 'vitest'

import { parseNative } from '@/bridge/parseNative'
import { isPlacements } from '@/features/skins/stage/guards/isPlacements'
import { stage } from '@/features/skins/stage/stage'
import type { StageEvent } from '@/features/skins/stage/stageNative'
import type { Placement } from '@/features/skins/stage/types'
import type { SkinWindowEvent } from '@/features/skins/types'
import { isShape } from '@/shared/utils/guards'

const isScene = isShape<{ panels: Placement[] }>({ panels: isPlacements })

// The stage's native side (Linux's StageModule), faked: panels open where
// asked, resizes take effect, and gestures report what the test sends.
const calls: {
  regions: number[][]
  gestures: { id: string; kind: string }[]
  saved: string[]
} = { regions: [], gestures: [], saved: [] }
let stageListener: ((e: StageEvent) => void) | undefined

const fake = {
  onStageEvent: (listener: (e: StageEvent) => void) => {
    stageListener = listener
    return { remove: () => {} }
  },
  load: () => 'null',
  save: (json: string) => {
    calls.saved.push(json)
  },
  place: (
    _scene: string,
    _id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => JSON.stringify({ x, y, w, h }),
  analyze: () => JSON.stringify({ docked: [], constrain: [], tidy: [] }),
  scale: () => '[]',
  resize: (scene: string, id: string, dw: number, dh: number) =>
    JSON.stringify(
      parseNative(scene, isScene, 'scene')
        .panels.filter(p => p.id === id)
        .map(p => ({ id, x: p.x, y: p.y, w: p.w + dw, h: p.h + dh })),
    ),
  beginGesture: (_scene: string, id: string, kind: string) => {
    calls.gestures.push({ id, kind })
  },
  setInputRegion: (rects: number[]) => {
    calls.regions.push(rects)
  },
  moveToNextMonitor: () => {},
}

vi.mock('@/features/skins/stage/stageNative', () => ({
  stageNative: () => fake,
}))

const frameOf = (id: string) =>
  stage.getSnapshot().panels.find(p => p.id === id)?.frame

describe('stage', () => {
  it('waits for its size and the main panel, then centers the main panel', () => {
    stage.setMainLayout(400, 120, 1)
    expect(stage.getSnapshot().started).toBe(false)
    stage.setSize(1600, 1000)
    expect(stage.getSnapshot().started).toBe(true)
    expect(frameOf('main')).toEqual({ x: 600, y: 200, w: 400, h: 120 })
    // Clicks only on the main panel.
    expect(calls.regions.at(-1)).toEqual([600, 200, 400, 120])
  })

  it('opens the library docked below the main panel, and says so', () => {
    const events: SkinWindowEvent[] = []
    const off = stage.onEvent(e => events.push(e))
    stage.setVisible('library', true)
    off()
    expect(events).toEqual([{ window: 'library', event: 'shown' }])
    expect(stage.isVisible('library')).toBe(true)
    expect(frameOf('library')).toEqual({ x: 600, y: 320, w: 840, h: 420 })
    expect(stage.getSnapshot().order.at(-1)).toBe('library')
    expect(calls.regions.at(-1)).toEqual([
      600, 200, 400, 120, 600, 320, 840, 420,
    ])
    expect(calls.saved.length).toBeGreaterThan(0)
  })

  it('grows a panel to its minimum size', () => {
    stage.setPanelChrome('library', {
      minSize: [900, 300],
      resizable: true,
      scale: 1,
    })
    expect(frameOf('library')).toEqual({ x: 600, y: 320, w: 900, h: 420 })
  })

  it('moves panels with the frames a gesture reports', () => {
    stage.beginGesture('main', 'move')
    expect(calls.gestures.at(-1)).toEqual({ id: 'main', kind: 'move' })
    stageListener?.({
      frames: JSON.stringify([
        { id: 'main', x: 10, y: 20, w: 400, h: 120 },
        { id: 'library', x: 10, y: 140, w: 900, h: 420 },
      ]),
    })
    expect(frameOf('main')).toEqual({ x: 10, y: 20, w: 400, h: 120 })
    expect(frameOf('library')).toEqual({ x: 10, y: 140, w: 900, h: 420 })
    const saves = calls.saved.length
    stageListener?.({ end: true })
    expect(calls.saved.length).toBe(saves + 1)
  })

  it('hides a panel, keeping its frame for next time', () => {
    stage.setVisible('library', false)
    expect(stage.isVisible('library')).toBe(false)
    expect(calls.regions.at(-1)).toEqual([10, 20, 400, 120])
    stage.setVisible('library', true)
    expect(frameOf('library')).toEqual({ x: 10, y: 140, w: 900, h: 420 })
  })

  it('gives menus their place on the stage', () => {
    expect(stage.origin('library')).toEqual([10, 140])
  })
})

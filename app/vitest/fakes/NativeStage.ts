// The Linux stage's native module (src/features/skins/stage/stageNative.ts,
// app/linux/src/StageModule.h), faked: panels open where asked, resizes
// take effect, the layout saves here, gestures and the window's input
// region are recorded, and a gesture's frames are what the test sends.
// It's looked up through TurboModuleRegistry, not imported, so tests hand
// it over there:
//
//   vi.spyOn(TurboModuleRegistry, 'get').mockImplementation(name =>
//     name === 'SoundScraperStage' ? fakeStage.module : null,
//   )
//
// and arrange or inspect it through `fakeStage`. Call `fakeStage.reset()`
// in a beforeEach.
import { vi } from 'vitest'

import { parseNative } from '@/bridge/parseNative'
import { isPlacements } from '@/features/skins/stage/guards/isPlacements'
import { isSavedLayout } from '@/features/skins/stage/guards/isSavedLayout'
import type { Spec, StageEvent } from '@/features/skins/stage/stageNative'
import type { Placement, SavedLayout } from '@/features/skins/stage/types'
import { isShape } from '@/shared/utils/guards'

import { fakeEmitter } from './emitter'

/** A move or resize the stage handed to the native side. */
export type Gesture = {
  readonly panel: string
  readonly kind: string
  readonly minWidth: number
  readonly minHeight: number
}

type State = {
  /** The layout saved last (JSON), "null" if none. */
  saved: string
  /** The window's input region: flat [x, y, w, h, …], or null if never set. */
  inputRegion: readonly number[] | null
  gestures: Gesture[]
}

const initialState = (): State => ({
  saved: 'null',
  inputRegion: null,
  gestures: [],
})

const state: State = initialState()
const stageEvents = fakeEmitter<StageEvent>('fake:stageEvent')

const isScene = isShape<{ panels: Placement[] }>({ panels: isPlacements })

const native = {
  onStageEvent: vi.fn(stageEvents.on),
  load: vi.fn(() => state.saved),
  save: vi.fn((json: string) => {
    state.saved = json
  }),
  place: vi.fn(
    (_scene: string, _id: string, x: number, y: number, w: number, h: number) =>
      JSON.stringify({ x, y, w, h }),
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
      panel: string,
      kind: string,
      minWidth: number,
      minHeight: number,
    ) => {
      state.gestures = [...state.gestures, { panel, kind, minWidth, minHeight }]
    },
  ),
  setInputRegion: vi.fn((rects: number[]) => {
    state.inputRegion = rects
  }),
  moveToNextMonitor: vi.fn(() => {}),
} satisfies Spec

/** The module as TurboModuleRegistry hands it over. */
const module: Spec = native

/** The test's handle on the fake stage module. */
export const fakeStage = {
  native,
  module,
  /** Forgets the saved layout, gestures and input region, and the stage listening. */
  reset: () => {
    Object.assign(state, initialState())
    stageEvents.clear()
    Object.values(native).forEach(fn => {
      fn.mockClear()
    })
  },
  /** The layout saved from an earlier run. */
  setSavedLayout: (layout: SavedLayout) => {
    state.saved = JSON.stringify(layout)
  },
  /** The layout saved last, null if none. */
  savedLayout: (): SavedLayout | null =>
    state.saved === 'null'
      ? null
      : parseNative(state.saved, isSavedLayout, 'saved layout'),
  /** Where the stage window takes clicks: flat [x, y, w, h, …]. */
  inputRegion: (): readonly number[] | null => state.inputRegion,
  /** The moves and resizes handed to the native side, in order. */
  gestures: (): readonly Gesture[] => state.gestures,
  /** Sends a stage event (a gesture's frames, or its end), as the native side does. */
  emit: (event: StageEvent) => {
    stageEvents.emit(event)
  },
}

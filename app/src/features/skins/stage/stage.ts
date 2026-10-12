// The stage (Linux): one borderless, transparent window covering the
// monitor's work area, with the main panel and the side panels as views in
// it, placed here. Linux desktops on Wayland don't let a window place
// itself, so separate panel windows couldn't dock or snap; inside one
// window they do, through the Rust core's layout (ss_layout_*, the same
// snapping, docking and saving as on macOS and Windows) by way of
// StageModule (app/linux/src/StageModule.h). The window takes clicks only
// on the panels (its input region); elsewhere they go to the windows below.
//
// Coordinates are points from the stage's top left; the saved layout
// (layout.json) keeps them so.
import { parseNative } from '@/bridge/parseNative'
import type {
  PanelName,
  SkinWindowEvent,
  WindowName,
} from '@/features/skins/types'

import { isAnalysis } from './guards/isAnalysis'
import { isFrame } from './guards/isFrame'
import { isPlacements } from './guards/isPlacements'
import { isSavedLayout } from './guards/isSavedLayout'
import { stageNative } from './stageNative'
import type {
  Frame,
  Placement,
  SavedLayout,
  StagePanel,
  StageSnapshot,
} from './types'

/** First sizes, as on Windows (WindowManager.cpp). */
const PANEL_SIZES: Record<PanelName, readonly [number, number]> = {
  library: [840, 420],
  settings: [460, 560],
  details: [300, 480],
  editor: [860, 340],
  burn: [520, 480],
}

/** Panels reopened at launch when they were open (the others show something picked). */
const RESTORED: readonly PanelName[] = ['library', 'settings']

type Entry = {
  readonly id: WindowName
  frame: Frame
  visible: boolean
  resizable: boolean
  minW: number
  minH: number
  /** The skin scale of its chrome; null until it reports. */
  scale: number | null
}

const entries = new Map<WindowName, Entry>()
let order: WindowName[] = ['main']
let stageSize: readonly [number, number] | null = null
let mainSize: readonly [number, number] | null = null
let mainScale: number | null = null
let pendingScale = 1
let started = false
/** Panels asked for before the stage started. */
const waiting = new Set<PanelName>()
let saved: SavedLayout | null | undefined
let snapshot: StageSnapshot = { started: false, panels: [], order }
const listeners = new Set<() => void>()
const eventListeners = new Set<(e: SkinWindowEvent) => void>()
let subscribed = false

const native = stageNative

const savedLayout = (): SavedLayout | null => {
  if (saved === undefined) {
    try {
      const json = native().load()
      saved =
        json === 'null' ? null : parseNative(json, isSavedLayout, 'layout')
    } catch {
      saved = null
    }
  }
  return saved
}

const savedPanel = (id: WindowName) =>
  savedLayout()?.panels?.find(p => p.id === id && p.w > 0 && p.h > 0)

const sceneJson = (): string =>
  JSON.stringify({
    panels: [...entries.values()].map(e => ({
      id: e.id,
      ...e.frame,
      visible: e.visible,
      resizable: e.resizable,
      min_w: e.minW,
      min_h: e.minH,
    })),
    screens: stageSize
      ? [{ x: 0, y: 0, w: stageSize[0], h: stageSize[1] }]
      : [],
  })

const commit = () => {
  const panels: StagePanel[] = [...entries.values()].map(e => ({
    id: e.id,
    frame: e.frame,
    visible: e.visible,
  }))
  snapshot = { started, panels, order }
  if (started) {
    // Clicks on the panels; through to the desktop elsewhere.
    native().setInputRegion(
      panels
        .filter(p => p.visible)
        .flatMap(p => [p.frame.x, p.frame.y, p.frame.w, p.frame.h]),
    )
  }
  for (const listener of listeners) {
    listener()
  }
}

const apply = (placements: readonly Placement[]) => {
  for (const p of placements) {
    const entry = [...entries.values()].find(e => e.id === p.id)
    if (entry) {
      entry.frame = { x: p.x, y: p.y, w: p.w, h: p.h }
    }
  }
}

const applyJson = (json: string) => {
  try {
    apply(parseNative(json, isPlacements, 'placements'))
  } catch {}
}

const save = () => {
  if (!started) {
    return
  }
  native().save(
    JSON.stringify({
      version: 1,
      panels: [...entries.values()].map(e => ({
        id: e.id,
        ...e.frame,
        visible: e.visible,
      })),
      scale: mainScale ?? undefined,
    }),
  )
}

const analyze = (kind: 'constrain' | 'tidy') => {
  try {
    const analysis = parseNative(
      native().analyze(sceneJson()),
      isAnalysis,
      'layout analysis',
    )
    apply(analysis[kind])
    return analysis[kind].length > 0
  } catch {
    return false
  }
}

const emit = (e: SkinWindowEvent) => {
  for (const listener of eventListeners) {
    listener(e)
  }
}

const raise = (id: WindowName) => {
  if (order.at(-1) === id) {
    return false
  }
  order = [...order.filter(o => o !== id), id]
  return true
}

/** Resizes a panel to (w, h), keeping the panels docked to it attached. */
const resizeTo = (entry: Entry, w: number, h: number) => {
  if (entry.frame.w === w && entry.frame.h === h) {
    return
  }
  applyJson(
    native().resize(
      sceneJson(),
      entry.id,
      w - entry.frame.w,
      h - entry.frame.h,
    ),
  )
}

const enforceMinimum = (entry: Entry) => {
  resizeTo(
    entry,
    Math.max(entry.frame.w, entry.minW),
    Math.max(entry.frame.h, entry.minH),
  )
}

/** First time: the library below the main panel, settings beside it, … (as on Windows). */
const defaultFrame = (panel: PanelName): Frame => {
  const [w, h] = PANEL_SIZES[panel]
  const frameOf = (id: WindowName) => {
    const e = entries.get(id)
    return e?.visible ? e.frame : undefined
  }
  const main = frameOf('main') ?? { x: 0, y: 0, w: 0, h: 0 }
  const library = frameOf('library')
  switch (panel) {
    case 'library':
      return { x: main.x, y: main.y + main.h, w, h }
    case 'details':
      return library
        ? { x: library.x + library.w, y: library.y, w, h: library.h }
        : { x: main.x + main.w, y: main.y, w, h }
    case 'editor': {
      const above = library ?? main
      return { x: above.x, y: above.y + above.h, w, h }
    }
    case 'burn': {
      const left = library ?? main
      return { x: left.x + left.w, y: left.y, w, h }
    }
    case 'settings':
      return { x: main.x + main.w, y: main.y, w, h }
  }
}

const show = (panel: PanelName) => {
  const existing = entries.get(panel)
  if (existing?.visible) {
    if (raise(panel)) {
      commit()
    }
    return
  }
  const want = existing?.frame ?? savedPanel(panel) ?? defaultFrame(panel)
  const entry: Entry = existing ?? {
    id: panel,
    frame: { x: want.x, y: want.y, w: want.w, h: want.h },
    visible: false,
    resizable: true,
    minW: 0,
    minH: 0,
    scale: null,
  }
  entries.set(panel, entry)
  // Its remembered spot if that covers no open panel, else docked beside them.
  try {
    entry.frame = parseNative(
      native().place(sceneJson(), panel, want.x, want.y, want.w, want.h),
      isFrame,
      'placement',
    )
  } catch {
    entry.frame = { x: want.x, y: want.y, w: want.w, h: want.h }
  }
  entry.visible = true
  raise(panel)
  commit()
  emit({ window: panel, event: 'shown' })
  save()
}

const hide = (panel: PanelName) => {
  const entry = entries.get(panel)
  if (!entry?.visible) {
    return
  }
  entry.visible = false
  commit()
  emit({ window: panel, event: 'hidden' })
  save()
}

/** The main panel's size or scale changed: double size scales its docked group. */
const applyMainLayout = (w: number, h: number, scale: number) => {
  const main = entries.get('main')
  if (!main) {
    return
  }
  if (mainScale !== null && mainScale > 0 && mainScale !== scale) {
    applyJson(native().scale(sceneJson(), scale / mainScale))
  }
  mainScale = scale
  for (const e of entries.values()) {
    if (e.id !== 'main' && e.scale === scale) {
      enforceMinimum(e)
    }
  }
  resizeTo(main, w, h)
  analyze('constrain')
  commit()
  save()
}

const listen = () => {
  if (subscribed) {
    return
  }
  subscribed = true
  native().onStageEvent(e => {
    if (e.frames !== undefined) {
      applyJson(e.frames)
      commit()
    } else if (e.end === true) {
      save()
    }
  })
}

/** Once the stage and the main panel have sizes: place it, reopen panels. */
const start = () => {
  if (started || !stageSize || !mainSize) {
    return
  }
  started = true
  listen()
  const layout = savedLayout()
  const spot = savedPanel('main')
  const [w, h] = mainSize
  entries.set('main', {
    id: 'main',
    frame: spot
      ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h }
      : {
          x: Math.round((stageSize[0] - w) / 2),
          y: Math.round(stageSize[1] / 5),
          w,
          h,
        },
    visible: true,
    resizable: false,
    minW: 0,
    minH: 0,
    scale: null,
  })
  // Saved sizes are at the saved scale; applyMainLayout scales them.
  mainScale = spot ? layout?.scale ?? pendingScale : pendingScale
  for (const panel of RESTORED) {
    if (layout?.panels?.some(p => p.id === panel && p.visible === true)) {
      waiting.add(panel)
    }
  }
  for (const panel of waiting) {
    show(panel)
  }
  waiting.clear()
  applyMainLayout(w, h, pendingScale)
}

export const stage = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: (): StageSnapshot => snapshot,

  /** The stage window's size (the monitor's work area). */
  setSize: (w: number, h: number) => {
    if (w <= 0 || h <= 0) {
      return
    }
    stageSize = [w, h]
    if (!started) {
      start()
      return
    }
    // A new resolution or monitor: pull panels back on.
    analyze('constrain')
    commit()
    save()
  },

  /** The main panel's size at the skin scale (setMainLayout). */
  setMainLayout: (w: number, h: number, scale: number) => {
    mainSize = [w, h]
    pendingScale = scale
    if (!started) {
      start()
      return
    }
    applyMainLayout(w, h, scale)
  },

  /** A side panel's chrome: its minimum size, whether it resizes, its scale. */
  setPanelChrome: (
    panel: PanelName,
    chrome: {
      minSize: readonly [number, number]
      resizable: boolean
      scale: number
    },
  ) => {
    const entry = entries.get(panel)
    if (!entry) {
      return
    }
    const first = entry.scale === null
    entry.minW = chrome.minSize[0]
    entry.minH = chrome.minSize[1]
    entry.resizable = chrome.resizable
    entry.scale = chrome.scale
    // A panel's minimums for a new scale can arrive before the main
    // panel's change; the group's scaling then comes first.
    if (mainScale === chrome.scale) {
      enforceMinimum(entry)
    }
    if (first) {
      // Its minimums are known now: straighten the docked panels.
      analyze('tidy')
    }
    commit()
  },

  setVisible: (panel: PanelName, visible: boolean) => {
    if (!started) {
      if (visible) {
        waiting.add(panel)
      } else {
        waiting.delete(panel)
      }
      return
    }
    if (visible) {
      show(panel)
    } else {
      hide(panel)
    }
  },
  isVisible: (panel: PanelName): boolean =>
    entries.get(panel)?.visible ?? waiting.has(panel),

  /** Brings a panel to the front (a press in it). */
  raise: (id: WindowName) => {
    if (raise(id)) {
      commit()
    }
  },

  /** Moves or resizes a panel with the press in progress (DragSurface). */
  beginGesture: (id: WindowName, kind: 'move' | 'resize') => {
    const entry = entries.get(id)
    if (!started || !entry) {
      return
    }
    native().beginGesture(sceneJson(), id, kind, entry.minW, entry.minH)
  },

  /** Where a panel is on the stage (for its menus). */
  origin: (id: WindowName): readonly [number, number] => {
    const frame = entries.get(id)?.frame
    return frame ? [frame.x, frame.y] : [0, 0]
  },

  /** Shown and hidden panels. */
  onEvent: (listener: (e: SkinWindowEvent) => void): (() => void) => {
    eventListeners.add(listener)
    return () => {
      eventListeners.delete(listener)
    }
  },
}

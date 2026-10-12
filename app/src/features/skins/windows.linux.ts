// Linux (react-native-gtk4): the panels are windows this file opens with
// react-native-gtk4's Windows API, borderless and transparent like the main
// panel, each showing its registered root (index.js). The native side
// (app/linux/src/PanelChrome.cc) moves and resizes them from the skin's
// drag regions and grip, and shows the menus.
//
// Wayland doesn't let a window place itself, so panels open where the
// desktop puts them and don't dock or snap to each other.
import { type WindowHandle, Windows } from '@curiosity26/react-native-gtk4'
import type { EventSubscription } from 'react-native'

import { isSkinWindowEvent } from './guards/isSkinWindowEvent'
import { native } from './native'
import type { PanelName, Rect, SkinWindowEvent, WindowName } from './types'

type PanelSpec = {
  readonly component: string
  readonly title: string
  readonly size: readonly [number, number]
}

// The same components, titles and first sizes as on Windows
// (WindowManager.cpp).
const PANELS: Record<PanelName, PanelSpec> = {
  library: {
    component: 'SoundScraperLibrary',
    title: 'Library',
    size: [840, 420],
  },
  settings: {
    component: 'SoundScraperSettings',
    title: 'Settings',
    size: [460, 560],
  },
  details: {
    component: 'SoundScraperDetails',
    title: 'Details',
    size: [300, 480],
  },
  editor: {
    component: 'SoundScraperEditor',
    title: 'Editor',
    size: [860, 340],
  },
  burn: { component: 'SoundScraperBurn', title: 'Burn CD', size: [520, 480] },
}

type OpenPanel = {
  handle: WindowHandle
  size: [number, number]
  scale: number | null
}

const open = new Map<PanelName, OpenPanel>()
// The size each panel had when it last closed, for the next time.
const lastSize = new Map<PanelName, [number, number]>()
const listeners = new Set<(e: SkinWindowEvent) => void>()

const emit = (e: SkinWindowEvent) => {
  for (const listener of listeners) {
    listener(e)
  }
}

let mainSetUp = false

/** Closing the main panel from the desktop (Alt+F4) quits, as its close button does. */
const setUpMain = () => {
  if (mainSetUp) {
    return
  }
  mainSetUp = true
  Windows.main.setTitle('Sound Scraper')
  Windows.main.setInterceptClose(true)
  Windows.main.addListener('close-requested', () => {
    native().windowAction('quit')
  })
}

const closePanel = (panel: PanelName) => {
  const entry = open.get(panel)
  if (!entry) {
    return
  }
  open.delete(panel)
  lastSize.set(panel, entry.size)
  entry.handle.close()
  emit({ window: panel, event: 'hidden' })
}

const openPanel = (panel: PanelName) => {
  const existing = open.get(panel)
  if (existing) {
    existing.handle.focus()
    return
  }
  const spec = PANELS[panel]
  const size = lastSize.get(panel) ?? [spec.size[0], spec.size[1]]
  const handle = Windows.open({
    component: spec.component,
    title: spec.title,
    width: size[0],
    height: size[1],
    resizable: true,
    titleBar: 'none',
    transparent: true,
    // The desktop's close (Alt+F4) hides the panel, as its skin's close does.
    interceptClose: true,
  })
  const entry: OpenPanel = { handle, size: [size[0], size[1]], scale: null }
  open.set(panel, entry)
  handle.addListener('resize', e => {
    if (e.width !== undefined && e.height !== undefined) {
      entry.size = [e.width, e.height]
    }
  })
  handle.addListener('close-requested', () => {
    closePanel(panel)
  })
  handle.addListener('closed', () => {
    if (open.get(panel) === entry) {
      open.delete(panel)
      lastSize.set(panel, entry.size)
      emit({ window: panel, event: 'hidden' })
    }
  })
  emit({ window: panel, event: 'shown' })
}

const flat = (rects: Rect[]) => rects.flatMap(r => r)

export const windows = {
  setMainLayout: (
    size: [number, number],
    _drag: Rect[],
    _holes: Rect[],
    _scale: number,
  ) => {
    setUpMain()
    Windows.main.setMinimumSize(size[0], size[1])
    Windows.main.setSize(size[0], size[1])
  },
  /** A side panel's chrome (its size is the user's). */
  setPanelChrome: (
    panel: PanelName,
    chrome: {
      drag: Rect[]
      holes: Rect[]
      grip: Rect | null
      minSize: [number, number]
      scale: number
    },
  ) => {
    const entry = open.get(panel)
    if (!entry) {
      return
    }
    entry.handle.setMinimumSize(chrome.minSize[0], chrome.minSize[1])
    // Double size on or off: the panel grows or shrinks with the main one.
    if (entry.scale !== null && entry.scale !== chrome.scale) {
      const ratio = chrome.scale / entry.scale
      entry.handle.setSize(
        Math.max(chrome.minSize[0], Math.round(entry.size[0] * ratio)),
        Math.max(chrome.minSize[1], Math.round(entry.size[1] * ratio)),
      )
    }
    entry.scale = chrome.scale
    // Keeps the native side's view of the chrome as on the other platforms.
    native().setPanelLayout(
      panel,
      0,
      0,
      flat(chrome.drag),
      flat(chrome.holes),
      chrome.grip ? [...chrome.grip] : [],
      chrome.minSize[0],
      chrome.minSize[1],
      chrome.scale,
    )
  },
  minimize: () => {
    native().windowAction('minimize')
  },
  /** The React views start window moves and resizes (DragSurface). */
  jsGestures: true,
  beginGesture: (panel: WindowName, kind: 'move' | 'resize') => {
    native().beginGesture(panel, kind)
  },
  quit: () => {
    native().windowAction('quit')
  },
  setPanelVisible: (panel: PanelName, visible: boolean) => {
    if (visible) {
      openPanel(panel)
    } else {
      closePanel(panel)
    }
  },
  isPanelVisible: (panel: PanelName): boolean => open.has(panel),
  /** Native pop-up menu at (x, y) in a panel; '-' is a separator. */
  showMenu: (
    items: string[],
    checked: number,
    x: number,
    y: number,
    panel: WindowName = 'main',
  ) => native().showMenu(panel, items, checked, x, y),
  /** Window events: the panels' (from here) and the native side's. */
  onEvent: (
    listener: (e: SkinWindowEvent) => void,
  ): Pick<EventSubscription, 'remove'> => {
    listeners.add(listener)
    const nativeSubscription = native().onWindowEvent(e => {
      if (isSkinWindowEvent(e)) {
        listener(e)
      }
    })
    return {
      remove: () => {
        listeners.delete(listener)
        nativeSubscription.remove()
      },
    }
  },
}

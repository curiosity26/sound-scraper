import { type EventSubscription, Platform } from 'react-native'

import { isSkinWindowEvent } from './guards/isSkinWindowEvent'
import { native } from './native'
import type { PanelName, Rect, SkinWindowEvent, WindowName } from './types'

const flat = (rects: Rect[]) => rects.flatMap(r => r)

export const windows = {
  setMainLayout: (
    size: [number, number],
    drag: Rect[],
    holes: Rect[],
    scale: number,
  ) => {
    native().setPanelLayout(
      'main',
      size[0],
      size[1],
      flat(drag),
      flat(holes),
      [],
      size[0],
      size[1],
      scale,
    )
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
  /** Windows: the React views start window moves and resizes. */
  jsGestures: Platform.OS === 'windows',
  beginGesture: (panel: WindowName, kind: 'move' | 'resize') => {
    native().beginGesture(panel, kind)
  },
  quit: () => {
    native().windowAction('quit')
  },
  setPanelVisible: (panel: PanelName, visible: boolean) => {
    native().setPanelVisible(panel, visible)
  },
  isPanelVisible: (panel: PanelName): boolean => native().isPanelVisible(panel),
  /** Where a panel sits in its window: its top left (each panel is a window here). */
  origin: (_panel: WindowName): readonly [number, number] => [0, 0],
  /**
   * Native pop-up menu at (x, y) in a panel's window (pageX,
   * measureInWindow; a skin rect plus `origin`); '-' is a separator.
   */
  showMenu: (
    items: string[],
    checked: number,
    x: number,
    y: number,
    panel: WindowName = 'main',
  ) => native().showMenu(panel, items, checked, x, y),
  /** Window events; ones with a window or event the UI doesn't know are dropped. */
  onEvent: (listener: (e: SkinWindowEvent) => void): EventSubscription =>
    native().onWindowEvent(e => {
      if (isSkinWindowEvent(e)) {
        listener(e)
      }
    }),
}

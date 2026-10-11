import { type EventSubscription, Platform } from 'react-native'

import type { WindowEvent } from '@/native/NativeSkins'

import { native } from './native'
import type { PanelName, Rect } from './types'

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
  beginGesture: (panel: 'main' | PanelName, kind: 'move' | 'resize') => {
    native().beginGesture(panel, kind)
  },
  quit: () => {
    native().windowAction('quit')
  },
  setPanelVisible: (panel: PanelName, visible: boolean) => {
    native().setPanelVisible(panel, visible)
  },
  isPanelVisible: (panel: PanelName): boolean => native().isPanelVisible(panel),
  /** Native pop-up menu at (x, y) in a panel; '-' is a separator. */
  showMenu: (
    items: string[],
    checked: number,
    x: number,
    y: number,
    panel: 'main' | PanelName = 'main',
  ) => native().showMenu(panel, items, checked, x, y),
  onEvent: (listener: (e: WindowEvent) => void): EventSubscription =>
    native().onWindowEvent(listener),
}

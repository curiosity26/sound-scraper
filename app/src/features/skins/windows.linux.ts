// Linux (react-native-gtk4): the panels are views on the stage, one
// borderless, transparent window covering the monitor's work area
// (src/features/skins/stage, src/roots/Stage). The stage places, docks and
// snaps them as macOS and Windows do their windows; the native side
// (app/linux/src/PanelChrome.cc) runs the drags and resizes the skin's drag
// regions and grip start (DragSurface), and shows the menus.
import { Windows } from '@curiosity26/react-native-gtk4'
import type { EventSubscription } from 'react-native'

import { isSkinWindowEvent } from './guards/isSkinWindowEvent'
import { native } from './native'
import { stage } from './stage/stage'
import type { PanelName, Rect, SkinWindowEvent, WindowName } from './types'

let mainSetUp = false

/** Closing the stage from the desktop (Alt+F4) quits, as the main panel's close button does. */
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

export const windows = {
  setMainLayout: (
    size: [number, number],
    _drag: Rect[],
    _holes: Rect[],
    scale: number,
  ) => {
    setUpMain()
    stage.setMainLayout(size[0], size[1], scale)
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
    stage.setPanelChrome(panel, {
      minSize: chrome.minSize,
      resizable: chrome.grip !== null,
      scale: chrome.scale,
    })
  },
  minimize: () => {
    native().windowAction('minimize')
  },
  /** The React views start panel moves and resizes (DragSurface). */
  jsGestures: true,
  beginGesture: (panel: WindowName, kind: 'move' | 'resize') => {
    stage.beginGesture(panel, kind)
  },
  quit: () => {
    native().windowAction('quit')
  },
  setPanelVisible: (panel: PanelName, visible: boolean) => {
    stage.setVisible(panel, visible)
  },
  isPanelVisible: (panel: PanelName): boolean => stage.isVisible(panel),
  /** Native pop-up menu at (x, y) in a panel; '-' is a separator. */
  showMenu: (
    items: string[],
    checked: number,
    x: number,
    y: number,
    panel: WindowName = 'main',
  ) => {
    const [px, py] = stage.origin(panel)
    return native().showMenu(panel, items, checked, px + x, py + y)
  },
  /** Window events: the stage's (shown, hidden) and the native side's. */
  onEvent: (
    listener: (e: SkinWindowEvent) => void,
  ): Pick<EventSubscription, 'remove'> => {
    const removeStage = stage.onEvent(listener)
    const nativeSubscription = native().onWindowEvent(e => {
      if (isSkinWindowEvent(e)) {
        listener(e)
      }
    })
    return {
      remove: () => {
        removeStage()
        nativeSubscription.remove()
      },
    }
  },
}

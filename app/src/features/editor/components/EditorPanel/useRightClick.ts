// Right-clicks on a track (its row or its region), on every platform: the
// press or responder grant reports button 2 with a point in the window on
// Windows (so does its pointer event), and macOS and Linux send an aux click.
import { type RefObject, useRef } from 'react'
import type { GestureResponderEvent, View } from 'react-native'

import { clickPoint } from './clickPoint'
import type { AuxClick, MouseLike } from './types'

/** The press and pointer event of one click both say right-click: one menu. */
const SAME_CLICK_MS = 600

export type UseRightClickResult = {
  /** For the clicked view: aux clicks are placed from where it is. */
  readonly ref: RefObject<View | null>
  /** Spread on the clicked view: its pointer and aux click handlers. */
  readonly clickProps: object
  /**
   * For a press or responder grant: opens the menu and returns true when
   * it's a right-click (or comes right after one), so it's no click.
   */
  readonly rightPress: (e: GestureResponderEvent) => boolean
}

const mouseOf = (e: GestureResponderEvent): MouseLike => ({
  button: Reflect.get(e.nativeEvent, 'button') === 2 ? 2 : 0,
  pageX: e.nativeEvent.pageX,
  pageY: e.nativeEvent.pageY,
})

export const useRightClick = (
  open: (x: number, y: number) => void,
): UseRightClickResult => {
  const ref = useRef<View>(null)
  const last = useRef(0)
  const recent = () => Date.now() - last.current < SAME_CLICK_MS
  const show = (x: number, y: number) => {
    if (recent()) {
      return
    }
    last.current = Date.now()
    open(x, y)
  }
  const fromMouse = (e: MouseLike) => {
    if (e.button !== 2) {
      return false
    }
    show(e.pageX ?? 0, e.pageY ?? 0)
    return true
  }
  return {
    ref,
    clickProps: {
      // Windows reports the button on pointer events.
      onPointerDown: (e: { nativeEvent: MouseLike }) => {
        fromMouse(e.nativeEvent)
      },
      // macOS and Linux: a right-click is an aux click.
      onAuxClick: (e: { nativeEvent: AuxClick }) => {
        const click = e.nativeEvent
        if ((click.button ?? 2) !== 2) {
          return
        }
        const view = ref.current
        if (!view) {
          return
        }
        view.measure((_x, _y, _w, _h, pageX, pageY) => {
          const at = clickPoint(click, { x: pageX, y: pageY })
          show(at.x, at.y)
        })
      },
    },
    rightPress: e => fromMouse(mouseOf(e)) || recent(),
  }
}

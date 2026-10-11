import { useEffect, useMemo, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

import { useSkin } from '@/features/skins/hooks/useSkin'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import type { PanelName, Rect } from '@/features/skins/types'
import { windows } from '@/features/skins/windows'

export type UsePanelChromeResult = {
  /** The window's size in points; 0 × 0 until laid out. */
  readonly width: number
  readonly height: number
  /** The frame's insets (where the content goes), scaled. */
  readonly insets: {
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly left: number
  }
  /** The title bar's close and menu buttons, and the resize grip. */
  readonly closeRect: Rect | null
  readonly menuRect: Rect | null
  readonly grip: Rect | null
  readonly onLayout: (e: LayoutChangeEvent) => void
}

/**
 * A skinned side panel's chrome: the frame's insets, where its title bar
 * buttons and resize grip go at the window's size, and the matching drag
 * area, click holes, grip and minimum size for the native window.
 */
export const usePanelChrome = (
  panel: PanelName,
  hasMenu: boolean,
): UsePanelChromeResult => {
  const skin = useSkin()
  const s = useSkinScale()
  const def = skin.panels[panel]
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [w, h] = size
  const slice = def.frame?.slice ?? [24, 6, 6, 6]
  const top = slice[0] * s
  const right = slice[1] * s
  const bottom = slice[2] * s
  const left = slice[3] * s

  const { closeRect, menuRect, grip } = useMemo(() => {
    const close = def.close
    const menu = hasMenu ? def.menu : null
    return {
      closeRect: close
        ? ([
            w - (close.offset[0] + close.size[0]) * s,
            close.offset[1] * s,
            close.size[0] * s,
            close.size[1] * s,
          ] satisfies Rect)
        : null,
      menuRect: menu
        ? ([
            w - (menu.offset[0] + menu.size[0]) * s,
            menu.offset[1] * s,
            menu.size[0] * s,
            menu.size[1] * s,
          ] satisfies Rect)
        : null,
      grip: def.resizable
        ? ([
            w - def.grip[0] * s,
            h - def.grip[1] * s,
            def.grip[0] * s,
            def.grip[1] * s,
          ] satisfies Rect)
        : null,
    }
  }, [def, hasMenu, w, h, s])

  useEffect(() => {
    if (w === 0) {
      return
    }
    // Double size enlarges the frame, not the content, so the minimum only
    // grows by the frame's extra size (letting panels shrink to fit a
    // crowded screen).
    const min = def.minSize ?? [320, 200]
    const extra: [number, number] = [
      (left + right) * (1 - 1 / s),
      (top + bottom) * (1 - 1 / s),
    ]
    windows.setPanelChrome(panel, {
      drag: [[0, 0, w, top]],
      holes: [closeRect, menuRect].filter((r): r is Rect => r !== null),
      grip,
      minSize: [min[0] + extra[0], min[1] + extra[1]],
      scale: s,
    })
  }, [panel, def, w, top, right, bottom, left, s, closeRect, menuRect, grip])

  return {
    width: w,
    height: h,
    insets: { top, right, bottom, left },
    closeRect,
    menuRect,
    grip,
    onLayout: e => {
      const { width, height } = e.nativeEvent.layout
      setSize([width, height])
    },
  }
}

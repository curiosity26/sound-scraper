import React, { type FC, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import type { PanelName, Rect } from '@/features/skins/types'
import { windows } from '@/features/skins/windows'

export type DragSurfaceProps = {
  readonly panel: 'main' | PanelName
  /** Areas that move the window, in points from its top left. */
  readonly drag: readonly Rect[]
  /** The resize corner, if any. */
  readonly grip?: Rect | null
  /** Double click on a drag area (the main panel's shade toggle). */
  readonly onDoubleClick?: () => void
}

/**
 * Windows only: invisible areas under a panel's controls that start a
 * native window move (drag regions) or resize (grip) on mouse down. macOS
 * handles these in its window class, so this renders nothing there.
 * Render it before the panel's buttons so they stay on top.
 */
export const DragSurface: FC<DragSurfaceProps> = props => {
  const last = useRef(0)
  if (!windows.jsGestures) {
    return null
  }
  const start = (kind: 'move' | 'resize') => () => {
    if (kind === 'move' && props.onDoubleClick) {
      const now = Date.now()
      if (now - last.current < 400) {
        last.current = 0
        props.onDoubleClick()
        return true
      }
      last.current = now
    }
    windows.beginGesture(props.panel, kind)
    return true
  }
  const area = (r: Rect, kind: 'move' | 'resize', key: string) => (
    <View
      key={key}
      onStartShouldSetResponder={start(kind)}
      style={[
        styles.area,
        { left: r[0], top: r[1], width: r[2], height: r[3] },
      ]}
    />
  )
  return (
    <>
      {props.drag.map((r, i) => area(r, 'move', `d${String(i)}`))}
      {props.grip && area(props.grip, 'resize', 'grip')}
    </>
  )
}

const styles = StyleSheet.create({
  area: { position: 'absolute' },
})

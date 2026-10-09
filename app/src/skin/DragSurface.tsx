// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { useRef } from 'react'
import { View } from 'react-native'

import { type PanelName, windows } from './skins'
import type { Rect } from './types'

type Props = {
  panel: 'main' | PanelName
  /** Areas that move the window, in points from its top left. */
  drag: Rect[]
  /** The resize corner, if any. */
  grip?: Rect | null
  /** Double click on a drag area (the main panel's shade toggle). */
  onDoubleClick?: () => void
}

/**
 * Windows only: invisible areas under a panel's controls that start a
 * native window move (drag regions) or resize (grip) on mouse down. macOS
 * handles these in its window class, so this renders nothing there.
 * Render it before the panel's buttons so they stay on top.
 */
export function DragSurface(props: Props): React.JSX.Element | null {
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
      testID={`${props.panel}-${kind}-area`}
      onStartShouldSetResponder={start(kind)}
      style={{
        position: 'absolute',
        left: r[0],
        top: r[1],
        width: r[2],
        height: r[3],
      }}
    />
  )
  return (
    <>
      {props.drag.map((r, i) => area(r, 'move', `d${i}`))}
      {props.grip && area(props.grip, 'resize', 'grip')}
    </>
  )
}

import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

export type UseCoverSizeResult = {
  /** The cover's width and height. */
  readonly size: number
  /** For the pane's onLayout: measures the room the cover has. */
  readonly onLayout: (e: LayoutChangeEvent) => void
}

/** The cover art's size: as wide as the pane, and short enough to leave
 * room for the fields under it. */
export const useCoverSize = (): UseCoverSizeResult => {
  const [area, setArea] = useState({ width: 0, height: 0 })
  // The cover leaves room below it for the file name and title (about
  // 110 points), so they show without scrolling.
  const size = Math.max(
    96,
    Math.min(area.width, area.height > 0 ? area.height - 110 : area.width),
  )
  return {
    size,
    onLayout: e => {
      const { width, height } = e.nativeEvent.layout
      setArea({ width, height })
    },
  }
}

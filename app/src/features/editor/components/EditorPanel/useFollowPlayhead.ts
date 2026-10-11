// While playing, page the view to keep the playhead in sight.
import { useEffect } from 'react'

export type UseFollowPlayheadOptions = {
  readonly playheadMs: number
  readonly playing: boolean
  /** Nothing moves while something's being dragged. */
  readonly dragging: boolean
  readonly scale: number
  readonly scrollX: number
  readonly viewWidth: number
  readonly contentWidth: number
  readonly scrollToX: (x: number) => void
}

export const useFollowPlayhead = (options: UseFollowPlayheadOptions): void => {
  const {
    playheadMs,
    playing,
    dragging,
    scale,
    scrollX,
    viewWidth,
    contentWidth,
    scrollToX,
  } = options
  useEffect(() => {
    if (!playing || viewWidth === 0 || dragging) {
      return
    }
    const x = playheadMs / scale
    if (x < scrollX || x > scrollX + viewWidth - 4) {
      scrollToX(
        Math.max(0, Math.min(x - viewWidth * 0.1, contentWidth - viewWidth)),
      )
    }
  }, [
    playheadMs,
    playing,
    scale,
    scrollX,
    viewWidth,
    contentWidth,
    dragging,
    scrollToX,
  ])
}

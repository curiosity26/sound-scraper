/**
 * New scroll offset (points) after zooming to `next` ms/pt, keeping `ms`
 * where it was on screen (at `x` points from the view's left).
 */
export const zoomScroll = (ms: number, x: number, next: number): number => {
  return Math.max(0, ms / next - x)
}
